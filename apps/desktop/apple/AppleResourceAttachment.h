#pragma once
#import "AppleResourceBridge.h"
#import <CommonCrypto/CommonDigest.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

static constexpr NSUInteger YonderAttachmentLimit = 20 * 1024 * 1024;

static inline NSString *YonderHashHex(const uint8_t (&hash)[CC_SHA256_DIGEST_LENGTH]) {
    NSMutableString *hex = [NSMutableString stringWithCapacity:2 * sizeof(hash)];
    for (uint8_t byte : hash) [hex appendFormat:@"%02x", (unsigned)byte];
    return hex;
}

class YonderTemporaryAttachmentDirectory {
public:
    NSURL *url = nil;

    YonderTemporaryAttachmentDirectory() {
        NSString *pattern = [NSTemporaryDirectory() stringByAppendingPathComponent:@"yonder-source-XXXXXX"];
        NSMutableData *path = [[pattern dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];
        [path increaseLengthBy:1];
        const char *directory = mkdtemp(static_cast<char *>(path.mutableBytes));
        if (directory) url = [NSURL fileURLWithFileSystemRepresentation:directory isDirectory:YES relativeToURL:nil];
    }

    ~YonderTemporaryAttachmentDirectory() { if (url) [NSFileManager.defaultManager removeItemAtURL:url error:nil]; }
    YonderTemporaryAttachmentDirectory(const YonderTemporaryAttachmentDirectory &) = delete;
    YonderTemporaryAttachmentDirectory &operator=(const YonderTemporaryAttachmentDirectory &) = delete;
};

static inline NSString *YonderAttachmentMIME(NSString *name) {
    if (@available(macOS 11.0, *)) {
        if (name.pathExtension.length != 0) {
            NSString *mime = [UTType typeWithFilenameExtension:name.pathExtension].preferredMIMEType;
            if (mime.length != 0) return mime;
        }
    }
    return @"application/octet-stream";
}

static inline NSData *YonderReadAttachment(int directory, NSString *name, int32_t *status) {
    *status = AppleReadFailed;
    int fd = openat(directory, name.fileSystemRepresentation, O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
    if (fd == -1) {
        *status = errno == EACCES || errno == EPERM ? ApplePermissionDenied :
                  errno == ENOENT ? AppleNotFound : AppleReadFailed;
        return nil;
    }
    NSFileHandle *file = [[NSFileHandle alloc] initWithFileDescriptor:fd closeOnDealloc:YES];
    struct stat info = {};
    NSData *data = nil;
    if (fstat(fd, &info) == 0 && S_ISREG(info.st_mode) && info.st_size > 0) {
        if ((uint64_t)info.st_size > YonderAttachmentLimit) *status = AppleTooLarge;
        else {
            data = [file readDataUpToLength:YonderAttachmentLimit + 1 error:nil];
            if (data.length != (NSUInteger)info.st_size) data = nil;
        }
    }
    [file closeFile];
    if (data != nil) *status = AppleOK;
    return data;
}

static inline void YonderReplyAttachment(void *context, YonderAppleReply reply, NSString *name,
                                         NSString *mime, NSData *contents) {
    NSData *metadata = [NSJSONSerialization dataWithJSONObject:@{@"name": name, @"mimeType": mime}
                                                       options:0 error:nil];
    if (metadata.length == 0 || metadata.length > 4096 || contents.length == 0 ||
        contents.length > YonderAttachmentLimit) {
        reply(context, AppleReadFailed, nullptr, 0);
        return;
    }
    uint32_t size = CFSwapInt32HostToBig((uint32_t)metadata.length);
    NSMutableData *result = [NSMutableData dataWithCapacity:sizeof(size) + metadata.length + contents.length];
    [result appendBytes:&size length:sizeof(size)];
    [result appendData:metadata];
    [result appendData:contents];
    reply(context, AppleOK, result.bytes, result.length);
}
