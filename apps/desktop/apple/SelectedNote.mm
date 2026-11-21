#import <AppKit/AppKit.h>
#import <CoreServices/CoreServices.h>
#import "AppleResourceAttachment.h"

static NSString *const NotesBundle = @"com.apple.Notes";
static constexpr DescType NoteClass = 'note';
static constexpr DescType AttachmentClass = 'atts';

static bool notesRunning() {
    return [NSRunningApplication runningApplicationsWithBundleIdentifier:NotesBundle].count != 0;
}

static bool ensureNotesRunning(NSURL *url) {
    if (notesRunning()) return true;
    // The caller is a native worker. Launch on the main queue without changing the user's focus.
    dispatch_semaphore_t finished = dispatch_semaphore_create(0);
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
        configuration.activates = NO;
        configuration.hides = YES;
        configuration.promptsUserIfNeeded = NO;
        [NSWorkspace.sharedWorkspace openApplicationAtURL:url configuration:configuration
                                        completionHandler:^(NSRunningApplication *, NSError *) {
            dispatch_semaphore_signal(finished);
        }];
    });
    return dispatch_semaphore_wait(finished, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) == 0 &&
           notesRunning();
}

extern "C" int yonder_notes_status(bool prompt, bool launchExistingGrant) {
    @autoreleasepool {
        NSURL *url = [NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:NotesBundle];
        if (!url) return 4;
        if (!notesRunning() && (!(prompt || launchExistingGrant) || !ensureNotesRunning(url))) return 5;
        NSAppleEventDescriptor *target = [NSAppleEventDescriptor descriptorWithBundleIdentifier:NotesBundle];
        OSStatus status = AEDeterminePermissionToAutomateTarget(target.aeDesc, typeWildCard, typeWildCard, prompt);
        switch (status) {
        case noErr: return 0;
        case errAEEventWouldRequireUserConsent: return 1;
        case errAEEventNotPermitted: return 2;
        case procNotFound: return 5;
        default: return 3;
        }
    }
}

static NSAppleEventDescriptor *object(DescType kind, DescType form, NSAppleEventDescriptor *key,
                                     NSAppleEventDescriptor *container) {
    NSAppleEventDescriptor *record = [NSAppleEventDescriptor recordDescriptor];
    [record setDescriptor:[NSAppleEventDescriptor descriptorWithTypeCode:kind] forKeyword:keyAEDesiredClass];
    [record setDescriptor:[NSAppleEventDescriptor descriptorWithEnumCode:form] forKeyword:keyAEKeyForm];
    [record setDescriptor:key forKeyword:keyAEKeyData];
    [record setDescriptor:container forKeyword:keyAEContainer];
    return [record coerceToDescriptorType:typeObjectSpecifier];
}

static NSAppleEventDescriptor *request(AEEventID action, NSAppleEventDescriptor *item, OSStatus *status,
                                      DescType countedClass = NoteClass, NSURL *destination = nil) {
    NSAppleEventDescriptor *target = [NSAppleEventDescriptor descriptorWithBundleIdentifier:NotesBundle];
    NSAppleEventDescriptor *event = [NSAppleEventDescriptor appleEventWithEventClass:kAECoreSuite eventID:action
        targetDescriptor:target returnID:kAutoGenerateReturnID transactionID:kAnyTransactionID];
    [event setParamDescriptor:item forKeyword:keyDirectObject];
    if (action == kAECountElements) {
        [event setParamDescriptor:[NSAppleEventDescriptor descriptorWithTypeCode:countedClass] forKeyword:keyAEObjectClass];
    }
    if (destination) [event setParamDescriptor:[NSAppleEventDescriptor descriptorWithFileURL:destination]
                                    forKeyword:keyAEFile];
    AppleEvent reply = {typeNull, nullptr};
    *status = AESendMessage(event.aeDesc, &reply, kAEWaitReply | kAEDoNotPromptForUserConsent,
                            destination ? 1200 : 120);
    if (*status != noErr) return nil;
    NSAppleEventDescriptor *response = [[NSAppleEventDescriptor alloc] initWithAEDescNoCopy:&reply];
    *status = [[response paramDescriptorForKeyword:keyErrorNumber] int32Value];
    return *status == noErr ? [response paramDescriptorForKeyword:keyDirectObject] : nil;
}

static NSAppleEventDescriptor *property(NSAppleEventDescriptor *note, DescType kind, OSStatus *status) {
    NSAppleEventDescriptor *data = object(cProperty, formPropertyID,
        [NSAppleEventDescriptor descriptorWithTypeCode:kind], note);
    return request(kAEGetData, data, status);
}

static NSString *bounded(NSString *entry, NSUInteger maximum) {
    if (entry.length <= maximum) return entry;
    if (CFStringIsSurrogateHighCharacter([entry characterAtIndex:maximum - 1])) --maximum;
    return [entry substringToIndex:maximum];
}

static NSString *noteContentFingerprint(NSAppleEventDescriptor *note, NSString *title, NSUInteger &budget) {
    if (!budget) return nil;
    OSStatus status = noErr;
    NSAppleEventDescriptor *attachments = request(kAECountElements, note, &status, AttachmentClass);
    // A partial fingerprint cannot identify a note whose body refers to embedded assets.
    if (!attachments || attachments.int32Value != 0) return nil;
    NSString *body = property(note, 'body', &status).stringValue;
    NSUInteger bodySize = [body lengthOfBytesUsingEncoding:NSUTF8StringEncoding];
    NSData *titleBytes = [title dataUsingEncoding:NSUTF8StringEncoding];
    if (bodySize == 0 || bodySize > budget || titleBytes.length > budget - bodySize) return nil;
    NSData *bodyBytes = [body dataUsingEncoding:NSUTF8StringEncoding];
    if (bodyBytes.length != bodySize || !titleBytes) return nil;
    budget -= titleBytes.length + bodySize;
    uint32_t titleSize = CFSwapInt32HostToBig((uint32_t)titleBytes.length);
    CC_SHA256_CTX digest;
    CC_SHA256_Init(&digest);
    CC_SHA256_Update(&digest, &titleSize, sizeof(titleSize));
    CC_SHA256_Update(&digest, titleBytes.bytes, (CC_LONG)titleBytes.length);
    CC_SHA256_Update(&digest, bodyBytes.bytes, (CC_LONG)bodyBytes.length);
    uint8_t hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256_Final(hash, &digest);
    return YonderHashHex(hash);
}

static NSDictionary *listNotes(int limit, int offset, OSStatus *status) {
    NSAppleEventDescriptor *root = [NSAppleEventDescriptor nullDescriptor];
    NSAppleEventDescriptor *count = request(kAECountElements, root, status);
    if (!count) return nil;
    int total = count.int32Value;
    int end = MIN(total, offset + limit);
    NSMutableArray *rows = [NSMutableArray arrayWithCapacity:limit];
    NSISO8601DateFormatter *dateFormatter = [[NSISO8601DateFormatter alloc] init];
    NSUInteger fingerprintBudget = 128 * 1024;
    int fingerprintReads = 8;
    for (int index = offset + 1; index <= end; ++index) {
        NSAppleEventDescriptor *record = object(NoteClass, formAbsolutePosition,
            [NSAppleEventDescriptor descriptorWithInt32:index], root);
        NSAppleEventDescriptor *locked = property(record, 'pwpr', status);
        if (!locked) return nil;
        if (locked.booleanValue) continue;
        NSString *noteID = property(record, 'ID  ', status).stringValue;
        if (!noteID) return nil;
        NSString *title = property(record, pName, status).stringValue;
        if (!title) return nil;
        NSDate *modified = property(record, 'asmo', status).dateValue;
        if (*status != noErr) return nil;
        id timestamp = modified ? [dateFormatter stringFromDate:modified] : NSNull.null;
        NSMutableDictionary *item = [@{@"id": noteID, @"title": bounded(title, 300), @"modifiedAt": timestamp} mutableCopy];
        if (fingerprintReads > 0 && fingerprintBudget > 0) {
            --fingerprintReads;
            NSString *fingerprint = noteContentFingerprint(record, title, fingerprintBudget);
            if (fingerprint) item[@"sourceIdentity"] = @{@"contentSha256": fingerprint};
        }
        [rows addObject:item];
    }
    return @{@"kind": @"apple_notes_list", @"notes": rows, @"more": @(total > end)};
}

static NSAppleEventDescriptor *unlockedNote(NSString *noteID, OSStatus *status) {
    NSAppleEventDescriptor *record = object(NoteClass, formUniqueID,
        [NSAppleEventDescriptor descriptorWithString:noteID], [NSAppleEventDescriptor nullDescriptor]);
    NSAppleEventDescriptor *locked = property(record, 'pwpr', status);
    if (!locked) return nil;
    if (locked.booleanValue) {
        *status = errAEEventNotPermitted;
        return nil;
    }
    return record;
}

static NSString *attachmentName(NSAppleEventDescriptor *attachment, OSStatus *status) {
    NSString *name = property(attachment, pName, status).stringValue.lastPathComponent;
    return name.length == 0 ? @"attachment" : bounded(name, 250);
}

static NSArray *listAttachments(NSAppleEventDescriptor *note, int offset, bool *more, OSStatus *status) {
    NSAppleEventDescriptor *total = request(kAECountElements, note, status, AttachmentClass);
    if (!total) return nil;
    int end = MIN(total.int32Value, offset + 20);
    *more = total.int32Value > end;
    NSMutableArray *rows = [NSMutableArray arrayWithCapacity:MAX(0, end - offset)];
    NSMutableSet *seen = [NSMutableSet set];
    for (int index = offset + 1; index <= end; ++index) {
        NSAppleEventDescriptor *attachment = object(AttachmentClass, formAbsolutePosition,
            [NSAppleEventDescriptor descriptorWithInt32:index], note);
        NSString *identifier = property(attachment, 'ID  ', status).stringValue;
        if (identifier.length == 0 || [seen containsObject:identifier]) continue;
        [seen addObject:identifier];
        NSString *name = attachmentName(attachment, status);
        [rows addObject:@{@"id": identifier, @"name": name, @"mimeType": YonderAttachmentMIME(name)}];
    }
    return rows;
}

static NSDictionary *readNote(NSString *noteID, int offset, OSStatus *status) {
    NSAppleEventDescriptor *record = unlockedNote(noteID, status);
    if (!record) return nil;
    NSString *text = property(record, 'text', status).stringValue;
    if (!text) return nil;
    NSMutableDictionary *result = [@{@"kind": @"apple_notes_read", @"id": noteID,
        @"text": bounded(text, 10000), @"truncated": @(text.length > 10000)} mutableCopy];
    bool moreAttachments = false;
    NSArray *attachments = listAttachments(record, offset, &moreAttachments, status);
    if (attachments) {
        result[@"attachments"] = attachments;
        result[@"moreAttachments"] = @(moreAttachments);
    }
    return result;
}

extern "C" void yonder_notes_execute(bool list, int limit, int offset, const char *note,
                                     void *context, void (*reply)(void *, int, const void *, size_t)) {
    @autoreleasepool {
        if (yonder_notes_status(false, true) != 0) {
            reply(context, 1, nullptr, 0);
            return;
        }
        OSStatus status = noErr;
        NSDictionary *result = list ? listNotes(limit, offset, &status) :
            readNote([NSString stringWithUTF8String:note], offset, &status);
        if (!result) {
            int error = (status == errAEEventNotPermitted || status == errAEEventWouldRequireUserConsent) ? 1 :
                        status == errAENoSuchObject ? 2 : 3;
            reply(context, error, nullptr, 0);
            return;
        }
        NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        reply(context, 0, data.bytes, data.length);
    }
}

static int32_t attachmentError(OSStatus status) {
    if (status == errAEEventNotPermitted || status == errAEEventWouldRequireUserConsent) return ApplePermissionDenied;
    return status == errAENoSuchObject ? AppleNotFound : AppleReadFailed;
}

extern "C" void yonder_notes_attachment(const char *noteID, const char *attachmentID,
                                         void *context, YonderAppleReply reply) {
    @autoreleasepool {
        if (yonder_notes_status(false, true) != 0) {
            reply(context, ApplePermissionDenied, nullptr, 0);
            return;
        }
        OSStatus status = noErr;
        NSAppleEventDescriptor *note = unlockedNote([NSString stringWithUTF8String:noteID], &status);
        if (!note) {
            reply(context, attachmentError(status), nullptr, 0);
            return;
        }
        NSString *requested = [NSString stringWithUTF8String:attachmentID];
        NSAppleEventDescriptor *attachment = object(AttachmentClass, formUniqueID,
            [NSAppleEventDescriptor descriptorWithString:requested], note);
        NSString *actual = property(attachment, 'ID  ', &status).stringValue;
        if (![actual isEqualToString:requested]) {
            reply(context, status == noErr ? AppleNotFound : attachmentError(status), nullptr, 0);
            return;
        }
        NSString *name = attachmentName(attachment, &status);
        YonderTemporaryAttachmentDirectory temporary;
        if (!temporary.url) {
            reply(context, AppleReadFailed, nullptr, 0);
            return;
        }
        NSURL *destination = [temporary.url URLByAppendingPathComponent:@"contents" isDirectory:NO];
        request(kAESave, attachment, &status, NoteClass, destination);
        int32_t result = attachmentError(status);
        NSData *bytes = nil;
        if (status == noErr) {
            int fd = open(temporary.url.fileSystemRepresentation, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
            if (fd >= 0) {
                bytes = YonderReadAttachment(fd, @"contents", &result);
                close(fd);
            }
        }
        if (bytes) YonderReplyAttachment(context, reply, name, YonderAttachmentMIME(name), bytes);
        else reply(context, result, nullptr, 0);
    }
}
