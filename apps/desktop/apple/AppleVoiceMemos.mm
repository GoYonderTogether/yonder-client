#import "AppleResourceAttachment.h"
#import <AVFoundation/AVFoundation.h>
#include <atomic>
#include <cmath>
#include <sqlite3.h>

static constexpr int Checking = -1;
static std::atomic<int> permission{AppleUndetermined};

static NSString *recordingsDirectory() {
    return [NSHomeDirectory() stringByAppendingPathComponent:
        @"Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"];
}

class RecordingDatabase {
public:
    sqlite3 *connection = nullptr;
    int32_t status = AppleReadFailed;

    explicit RecordingDatabase(NSString *directory) {
        NSString *path = [directory stringByAppendingPathComponent:@"CloudRecordings.db"];
        // Open the source in place for a consistent WAL view. The connector never changes its data.
        errno = 0;
        int result = sqlite3_open_v2(path.fileSystemRepresentation, &connection,
                                     SQLITE_OPEN_READONLY | SQLITE_OPEN_NOFOLLOW, nullptr);
        int systemError = result == SQLITE_OK || !connection ? errno : sqlite3_system_errno(connection);
        if (result == SQLITE_OK) status = AppleOK;
        else if (systemError == EACCES || systemError == EPERM || result == SQLITE_PERM) status = ApplePermissionDenied;
        else if (systemError == ENOENT) status = AppleUnavailable;
    }

    ~RecordingDatabase() { if (connection) sqlite3_close(connection); }
    RecordingDatabase(const RecordingDatabase &) = delete;
    RecordingDatabase &operator=(const RecordingDatabase &) = delete;
};

class RecordingQuery {
public:
    sqlite3_stmt *value = nullptr;

    RecordingQuery(sqlite3 *database, const char *sql) {
        sqlite3_prepare_v2(database, sql, -1, &value, nullptr);
    }

    ~RecordingQuery() { sqlite3_finalize(value); }
    RecordingQuery(const RecordingQuery &) = delete;
    RecordingQuery &operator=(const RecordingQuery &) = delete;
};

extern "C" int32_t yonder_voice_memos_permission(bool probe, bool explicitRequest) {
    @autoreleasepool {
        int state = permission.load();
        if (!probe || state == Checking || (!explicitRequest && state != AppleUndetermined)) {
            return state == Checking ? AppleUndetermined : state;
        }
        if (!permission.compare_exchange_strong(state, Checking)) {
            return state == Checking ? AppleUndetermined : state;
        }
        RecordingDatabase database(recordingsDirectory());
        int32_t current = database.status == ApplePermissionDenied ? AppleDenied : AppleSourceUnavailable;
        if (database.status == AppleOK) {
            RecordingQuery schema(database.connection,
                "SELECT ZUNIQUEID,ZDATE,ZDURATION,ZENCRYPTEDTITLE,ZCUSTOMLABEL,ZPATH,ZEVICTIONDATE "
                "FROM ZCLOUDRECORDING LIMIT 0");
            current = schema.value ? AppleGranted : AppleUnsupported;
        }
        permission.store(current);
        return current;
    }
}

static NSString *columnText(sqlite3_stmt *row, int column) {
    const unsigned char *text = sqlite3_column_text(row, column);
    return text ? [NSString stringWithUTF8String:reinterpret_cast<const char *>(text)] : nil;
}

static id columnDate(sqlite3_stmt *row, int column, NSISO8601DateFormatter *formatter) {
    if (sqlite3_column_type(row, column) == SQLITE_NULL) return NSNull.null;
    double time = sqlite3_column_double(row, column);
    if (!std::isfinite(time) || time < -3.2e10 || time > 3.2e10) return NSNull.null;
    return [formatter stringFromDate:[NSDate dateWithTimeIntervalSinceReferenceDate:time]] ?: NSNull.null;
}

static id columnDuration(sqlite3_stmt *row, int column) {
    if (sqlite3_column_type(row, column) == SQLITE_NULL) return NSNull.null;
    double duration = sqlite3_column_double(row, column);
    return std::isfinite(duration) && duration >= 0 && duration < 3.2e10 ? @(llround(duration * 1000)) : NSNull.null;
}

static NSString *recordingFilename(NSString *path, NSString *directory);

static NSString *recordingFingerprint(int directory, NSString *name, off_t &budget) {
    if (directory < 0 || !name || budget == 0) return nil;
    int file = openat(directory, name.fileSystemRepresentation, O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
    if (file < 0) return nil;
    struct stat info = {};
    if (fstat(file, &info) != 0 || !S_ISREG(info.st_mode) || info.st_size <= 0 || info.st_size > budget) {
        close(file);
        return nil;
    }
    CC_SHA256_CTX digest;
    CC_SHA256_Init(&digest);
    off_t remaining = info.st_size;
    uint8_t chunk[64 * 1024];
    while (remaining > 0) {
        ssize_t count = read(file, chunk, (size_t)MIN(remaining, (off_t)sizeof(chunk)));
        if (count <= 0) break;
        CC_SHA256_Update(&digest, chunk, (CC_LONG)count);
        remaining -= count;
        budget -= count;
    }
    bool complete = remaining == 0 && read(file, chunk, 1) == 0;
    close(file);
    if (!complete) return nil;
    uint8_t hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256_Final(hash, &digest);
    return YonderHashHex(hash);
}

static void listRecordings(sqlite3 *database, NSString *directory, NSDictionary *args,
                           void *context, YonderAppleReply reply) {
    // Recently Deleted items may still have a playable file until the app purges them.
    RecordingQuery query(database, "SELECT ZUNIQUEID,COALESCE(ZENCRYPTEDTITLE,ZCUSTOMLABEL),ZDATE,ZDURATION,ZPATH "
        "FROM ZCLOUDRECORDING WHERE ZUNIQUEID != '' AND ZPATH IS NOT NULL AND ZEVICTIONDATE IS NULL "
        "ORDER BY ZDATE DESC,Z_PK DESC LIMIT ? OFFSET ?");
    if (!query.value) { reply(context, AppleUnavailable, nullptr, 0); return; }
    NSUInteger limit = YonderListLimit(args);
    sqlite3_bind_int(query.value, 1, (int)limit + 1);
    sqlite3_bind_int(query.value, 2, [args[@"offset"] intValue]);
    NSMutableArray *recordings = [NSMutableArray arrayWithCapacity:limit];
    NSISO8601DateFormatter *formatter = [NSISO8601DateFormatter new];
    int fd = open(directory.fileSystemRepresentation, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    // Bound local I/O per list. A recording stays visible when its full-byte hash is unavailable.
    off_t fingerprintBudget = 16 * 1024 * 1024;
    bool more = false;
    int step = SQLITE_DONE;
    while ((step = sqlite3_step(query.value)) == SQLITE_ROW) {
        if (recordings.count == limit) { more = true; break; }
        NSString *identifier = columnText(query.value, 0);
        if (identifier.length == 0) continue;
        NSMutableDictionary *item = [@{@"id": identifier, @"title": YonderText(columnText(query.value, 1), 300),
            @"createdAt": columnDate(query.value, 2, formatter), @"durationMs": columnDuration(query.value, 3)} mutableCopy];
        NSString *name = recordingFilename(columnText(query.value, 4), directory);
        NSString *checksum = recordingFingerprint(fd, name, fingerprintBudget);
        if (checksum) item[@"sourceIdentity"] = @{@"contentSha256": checksum};
        [recordings addObject:item];
    }
    if (fd >= 0) close(fd);
    if (step == SQLITE_DONE || more) {
        YonderReplyJSON(context, reply, @{@"kind": @"apple_voice_memos_list", @"recordings": recordings,
                                         @"more": @(more)});
    } else reply(context, AppleReadFailed, nullptr, 0);
}

static NSString *recordingFilename(NSString *path, NSString *directory) {
    if ([path hasPrefix:@"file://"]) {
        NSURL *url = [NSURL URLWithString:path];
        if (!url.isFileURL || (url.host.length != 0 && ![url.host isEqualToString:@"localhost"])) return nil;
        path = url.path;
    }
    NSString *file = path.lastPathComponent;
    NSString *extension = file.pathExtension.lowercaseString;
    if (![extension isEqualToString:@"m4a"] && ![extension isEqualToString:@"qta"]) return nil;
    if (path.isAbsolutePath) {
        return [path.stringByDeletingLastPathComponent isEqualToString:directory] ? file : nil;
    }
    return [file isEqualToString:path] ? file : nil;
}

static NSData *transcriptionWave(NSData *contents, NSString *extension, int32_t *status) {
    *status = AppleReadFailed;
    YonderTemporaryAttachmentDirectory temporary;
    if (!temporary.url) return nil;
    NSString *name = [@"original" stringByAppendingPathExtension:extension];
    NSURL *url = [temporary.url URLByAppendingPathComponent:name isDirectory:NO];
    if (![contents writeToURL:url options:NSDataWritingWithoutOverwriting error:nil]) return nil;
    AVAudioFile *file = [[AVAudioFile alloc] initForReading:url error:nil];
    double rate = file.processingFormat.sampleRate;
    if (!file || !std::isfinite(rate) || rate <= 0 || file.length <= 0) return nil;
    if ((double)file.length / rate > 120) { *status = AppleTooLarge; return nil; }

    constexpr AVAudioFrameCount maximumFrames = 16000 * 120;
    AVAudioFormat *target = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatInt16
        sampleRate:16000 channels:1 interleaved:YES];
    AVAudioConverter *converter = [[AVAudioConverter alloc] initFromFormat:file.processingFormat toFormat:target];
    AVAudioPCMBuffer *block = [[AVAudioPCMBuffer alloc] initWithPCMFormat:file.processingFormat frameCapacity:4096];
    AVAudioPCMBuffer *output = [[AVAudioPCMBuffer alloc] initWithPCMFormat:target frameCapacity:maximumFrames + 1];
    if (!converter || !block || !output) return nil;

    __block bool failed = false;
    AVAudioConverterOutputStatus result = [converter convertToBuffer:output error:nil
        withInputFromBlock:^AVAudioBuffer *(AVAudioPacketCount requested, AVAudioConverterInputStatus *next) {
            AVAudioFramePosition remaining = file.length - file.framePosition;
            if (remaining <= 0) { *next = AVAudioConverterInputStatus_EndOfStream; return nil; }
            AVAudioFrameCount count = (AVAudioFrameCount)MIN(remaining, MIN(requested, block.frameCapacity));
            if (![file readIntoBuffer:block frameCount:count error:nil]) failed = true;
            if (failed || block.frameLength == 0) { *next = AVAudioConverterInputStatus_EndOfStream; return nil; }
            *next = AVAudioConverterInputStatus_HaveData;
            return block;
        }];
    if (failed || result == AVAudioConverterOutputStatus_Error || output.frameLength == 0) return nil;
    if (output.frameLength > maximumFrames) { *status = AppleTooLarge; return nil; }

    uint32_t bytes = output.frameLength * sizeof(int16_t);
    struct WaveHeader {
        char riff[4]; uint32_t frameSize; char wave[4]; char format[4]; uint32_t formatSize;
        uint16_t codec; uint16_t channels; uint32_t sampleRate; uint32_t byteRate;
        uint16_t alignment; uint16_t bitDepth; char data[4]; uint32_t dataSize;
    } header = {{'R','I','F','F'}, CFSwapInt32HostToLittle(bytes + 36), {'W','A','V','E'}, {'f','m','t',' '},
        CFSwapInt32HostToLittle(16), CFSwapInt16HostToLittle(1), CFSwapInt16HostToLittle(1),
        CFSwapInt32HostToLittle(16000), CFSwapInt32HostToLittle(32000),
        CFSwapInt16HostToLittle(2), CFSwapInt16HostToLittle(16), {'d','a','t','a'}, CFSwapInt32HostToLittle(bytes)};
    static_assert(sizeof(WaveHeader) == 44, "PCM WAV header is 44 bytes");
    NSMutableData *wave = [NSMutableData dataWithBytes:&header length:sizeof(header)];
    [wave appendBytes:output.int16ChannelData[0] length:bytes];
    *status = AppleOK;
    return wave;
}

static NSString *activeRecordingFilename(sqlite3 *database, NSString *directory, NSString *identifier) {
    RecordingQuery query(database, "SELECT ZPATH FROM ZCLOUDRECORDING WHERE ZUNIQUEID = ? AND ZEVICTIONDATE IS NULL LIMIT 2");
    if (!query.value) return nil;
    sqlite3_bind_text(query.value, 1, identifier.UTF8String, -1, SQLITE_TRANSIENT);
    int step = sqlite3_step(query.value);
    NSString *name = step == SQLITE_ROW ? recordingFilename(columnText(query.value, 0), directory) : nil;
    return name && sqlite3_step(query.value) == SQLITE_DONE ? name : nil;
}

static void readRecording(sqlite3 *database, NSString *directory, NSString *identifier,
                          bool transcribe, void *context, YonderAppleReply reply) {
    NSString *name = activeRecordingFilename(database, directory, identifier);
    if (!name) {
        reply(context, AppleNotFound, nullptr, 0);
        return;
    }
    int fd = open(directory.fileSystemRepresentation, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) {
        reply(context, errno == EPERM || errno == EACCES ? ApplePermissionDenied : AppleReadFailed, nullptr, 0);
        return;
    }
    int32_t status = AppleReadFailed;
    NSData *contents = YonderReadAttachment(fd, name, &status);
    close(fd);
    NSString *extension = name.pathExtension.lowercaseString;
    if (contents && transcribe) contents = transcriptionWave(contents, extension, &status);
    if (contents && ![name isEqualToString:activeRecordingFilename(database, directory, identifier)]) {
        contents = nil;
        status = AppleNotFound;
    }
    NSString *mime = [extension isEqualToString:@"qta"] ? @"audio/quicktime" : @"audio/mp4";
    if (contents) YonderReplyAttachment(context, reply, transcribe ? @"recording.wav" : name,
        transcribe ? @"audio/wav" : mime, contents);
    else reply(context, status, nullptr, 0);
}

extern "C" void yonder_voice_memos_execute(int32_t operation, const char *arguments, void *context, YonderAppleReply reply) {
    @autoreleasepool {
        NSDictionary *args = [NSJSONSerialization JSONObjectWithData:
            [NSData dataWithBytes:arguments length:strlen(arguments)] options:0 error:nil];
        if (![args isKindOfClass:NSDictionary.class]) { reply(context, AppleInvalidInput, nullptr, 0); return; }
        if (permission.load() != AppleGranted) { reply(context, ApplePermissionDenied, nullptr, 0); return; }
        NSString *directory = recordingsDirectory();
        RecordingDatabase database(directory);
        if (database.status != AppleOK) {
            if (database.status == ApplePermissionDenied) permission.store(AppleDenied);
            reply(context, database.status, nullptr, 0);
        } else if (operation == 1 || operation == 2) {
            readRecording(database.connection, directory, args[@"id"], operation == 2, context, reply);
        } else if (operation == 0) listRecordings(database.connection, directory, args, context, reply);
        else reply(context, AppleInvalidInput, nullptr, 0);
    }
}
