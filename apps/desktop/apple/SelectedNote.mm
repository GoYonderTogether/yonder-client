#import <AppKit/AppKit.h>
#import <CoreServices/CoreServices.h>

static NSString *const NotesBundle = @"com.apple.Notes";
static constexpr DescType NoteClass = 'note';

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

static NSAppleEventDescriptor *request(AEEventID action, NSAppleEventDescriptor *item, OSStatus *status) {
    NSAppleEventDescriptor *target = [NSAppleEventDescriptor descriptorWithBundleIdentifier:NotesBundle];
    NSAppleEventDescriptor *event = [NSAppleEventDescriptor appleEventWithEventClass:kAECoreSuite eventID:action
        targetDescriptor:target returnID:kAutoGenerateReturnID transactionID:kAnyTransactionID];
    [event setParamDescriptor:item forKeyword:keyDirectObject];
    if (action == kAECountElements) {
        [event setParamDescriptor:[NSAppleEventDescriptor descriptorWithTypeCode:NoteClass] forKeyword:keyAEObjectClass];
    }
    AppleEvent reply = {typeNull, nullptr};
    *status = AESendMessage(event.aeDesc, &reply, kAEWaitReply | kAEDoNotPromptForUserConsent, 120);
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

static NSDictionary *listNotes(int limit, int offset, OSStatus *status) {
    NSAppleEventDescriptor *root = [NSAppleEventDescriptor nullDescriptor];
    NSAppleEventDescriptor *count = request(kAECountElements, root, status);
    if (!count) return nil;
    int total = count.int32Value;
    int end = MIN(total, offset + limit);
    NSMutableArray *rows = [NSMutableArray arrayWithCapacity:limit];
    NSISO8601DateFormatter *dateFormatter = [[NSISO8601DateFormatter alloc] init];
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
        [rows addObject:@{@"id": noteID, @"title": bounded(title, 300), @"modifiedAt": timestamp}];
    }
    return @{@"kind": @"apple_notes_list", @"notes": rows, @"more": @(total > end)};
}

static NSDictionary *readNote(NSString *noteID, OSStatus *status) {
    NSAppleEventDescriptor *record = object(NoteClass, formUniqueID,
        [NSAppleEventDescriptor descriptorWithString:noteID], [NSAppleEventDescriptor nullDescriptor]);
    NSAppleEventDescriptor *locked = property(record, 'pwpr', status);
    if (!locked) return nil;
    if (locked.booleanValue) {
        *status = errAEEventNotPermitted;
        return nil;
    }
    NSString *text = property(record, 'text', status).stringValue;
    if (!text) return nil;
    return @{@"kind": @"apple_notes_read", @"id": noteID, @"text": bounded(text, 10000),
             @"truncated": @(text.length > 10000)};
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
            readNote([NSString stringWithUTF8String:note], &status);
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
