#import "AppleResourceBridge.h"
#import <Photos/Photos.h>
#import <Vision/Vision.h>
#if TARGET_OS_IOS
#import "ApplePhotoDeltaState.h"
#include <atomic>
#endif
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import "AppleResourceAttachment.h"

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
using YonderOSImage = NSImage;
#else
#import <UIKit/UIKit.h>
using YonderOSImage = UIImage;
#endif

static int32_t permission(PHAuthorizationStatus status) API_AVAILABLE(macos(11.0), ios(14.0)) {
    switch (status) {
        case PHAuthorizationStatusNotDetermined: return AppleUndetermined;
        case PHAuthorizationStatusRestricted: return AppleRestricted;
        case PHAuthorizationStatusDenied: return AppleDenied;
        case PHAuthorizationStatusAuthorized: return AppleGranted;
        case PHAuthorizationStatusLimited: return AppleLimited;
        default: return AppleUnsupported;
    }
}

extern "C" int32_t yonder_apple_photos_status(void) {
    if (@available(macOS 11.0, iOS 14.0, *)) {
        return permission([PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite]);
    }
    return AppleUnsupported;
}

static BOOL hasPhotoAccess() {
    int32_t status = yonder_apple_photos_status();
    return status == AppleGranted || status == AppleLimited;
}

static BOOL visiblePhoto(PHAsset *asset) {
    return asset != nil && asset.mediaType == PHAssetMediaTypeImage && !asset.isHidden;
}

// The long edge a picture is fetched at when it is read or shown to a model: the size at which a
// provider stops losing anything (see `readPhoto`). Kept here so the device sends what the model
// would keep anyway, never a multi-megabyte original over a 3 Mbps uplink it will discard.
static constexpr CGFloat YonderPhotoReadEdge = 1280;

struct YonderApplePhotoFetch {
    YonderOSImage *image;
    // AppleOK when an image came back; AppleICloudOnly when the pixels are only in iCloud;
    // otherwise the real failure the caller is told.
    int32_t status;
    // True when only a degraded local copy could be had (the original is in iCloud): OCR and
    // labels still work on it, and the reader says so instead of pretending it saw the original.
    BOOL thumbnail;
};

// One opportunistic request, three times at most, because a single callback can be a degraded
// thumbnail delivered before the exact one. Network is never touched: the result says iCloud, and
// the caller decides. A library that has the asset but only in iCloud is a fact, not an error.
static YonderApplePhotoFetch YonderApplePhotoImage(PHAsset *asset, CGFloat edge)
    API_AVAILABLE(macos(10.15), ios(13.0)) {
    PHImageRequestOptions *options = [PHImageRequestOptions new];
    options.synchronous = YES;
    options.deliveryMode = PHImageRequestOptionsDeliveryModeOpportunistic;
    options.resizeMode = PHImageRequestOptionsResizeModeFast;
    options.networkAccessAllowed = NO;
    options.version = PHImageRequestOptionsVersionCurrent;
    __block YonderOSImage *image = nil;
    __block BOOL inCloud = NO;
    __block int32_t failure = 0;
    __block NSInteger highQuality = 0;
    for (NSInteger attempt = 0; attempt < 3; attempt++) {
        [[PHImageManager defaultManager] requestImageForAsset:asset targetSize:CGSizeMake(edge, edge)
            contentMode:PHImageContentModeAspectFit options:options
            resultHandler:^(YonderOSImage *candidate, NSDictionary *info) {
                NSDictionary *keys = info;
                if (keys[PHImageCancelledKey] != nil) { failure = AppleReadFailed; return; }
                NSError *error = keys[PHImageErrorKey];
                if (error != nil) {
                    if (error.domain == PHPhotosErrorDomain &&
                        error.code == PHPhotosErrorNetworkAccessRequired) inCloud = YES;
                    else failure = AppleReadFailed;
                    return;
                }
                if ([keys[PHImageResultIsInCloudKey] isKindOfClass:NSNumber.class] &&
                    [keys[PHImageResultIsInCloudKey] boolValue] && candidate == nil) {
                    inCloud = YES;
                    return;
                }
                if (candidate == nil) return;
                image = candidate;
                id degradedFlag = keys[PHImageResultIsDegradedKey];
                BOOL degraded = [degradedFlag isKindOfClass:NSNumber.class] && [degradedFlag boolValue];
                if (!degraded) highQuality = 1;
            }];
        if (image != nil && highQuality) break;
        if (image == nil && (inCloud || failure)) break;
    }
    if (image == nil && inCloud) return {nil, AppleICloudOnly, NO};
    if (image == nil) return {nil, failure ? failure : AppleUnavailable, NO};
    return {image, AppleOK, highQuality == 0};
}

extern "C" void yonder_apple_photos_request(void *context, YonderApplePermissionReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (@available(macOS 11.0, iOS 14.0, *)) {
            int32_t status = yonder_apple_photos_status();
            if (status != AppleUndetermined) {
                reply(context, status);
                return;
            }
            [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite handler:^(PHAuthorizationStatus status) {
                reply(context, permission(status));
            }];
        } else {
            reply(context, AppleUnsupported);
        }
    });
}

static void listPhotos(NSDictionary *args, void *context, YonderAppleReply reply) API_AVAILABLE(macos(10.15)) {
    NSDate *start = YonderParseDay(args[@"dateFrom"]);
    NSDate *last = YonderParseDay(args[@"dateTo"]);
    if ((args[@"dateFrom"] != nil && start == nil) || (args[@"dateTo"] != nil && last == nil) ||
        (start != nil && last != nil && [start compare:last] == NSOrderedDescending)) {
        reply(context, AppleInvalidInput, nullptr, 0);
        return;
    }
    NSMutableArray<NSPredicate *> *filters = [NSMutableArray arrayWithCapacity:2];
    if (start != nil) [filters addObject:[NSPredicate predicateWithFormat:@"creationDate >= %@", start]];
    if (last != nil) {
        NSDate *end = [YonderLocalCalendar() dateByAddingUnit:NSCalendarUnitDay value:1 toDate:last options:0];
        [filters addObject:[NSPredicate predicateWithFormat:@"creationDate < %@", end]];
    }
    NSUInteger offset = [args[@"offset"] unsignedIntegerValue];
    NSUInteger limit = YonderListLimit(args);
    PHFetchOptions *options = [PHFetchOptions new];
    if (filters.count) options.predicate = [NSCompoundPredicate andPredicateWithSubpredicates:filters];
    options.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
    options.fetchLimit = offset + limit + 1;
    PHFetchResult<PHAsset *> *assets = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:options];
    NSISO8601DateFormatter *formatter = [NSISO8601DateFormatter new];
    NSMutableArray<NSMutableDictionary *> *photos = [NSMutableArray arrayWithCapacity:limit];
    for (NSUInteger index = offset; index < MIN(assets.count, offset + limit); index++) {
        PHAsset *asset = assets[index];
        if (!visiblePhoto(asset) || asset.pixelWidth == 0 || asset.pixelHeight == 0) continue;
        [photos addObject:[@{
            @"id": asset.localIdentifier,
            @"createdAt": asset.creationDate == nil ? (id)NSNull.null : [formatter stringFromDate:asset.creationDate],
            @"width": @(asset.pixelWidth),
            @"height": @(asset.pixelHeight),
        } mutableCopy]];
    }
    if (!hasPhotoAccess()) {
        reply(context, ApplePermissionDenied, nullptr, 0);
        return;
    }
    BOOL more = assets.count > offset + limit;
    NSMutableArray<NSString *> *identifiers = [[photos valueForKey:@"id"] mutableCopy];
    if (@available(macOS 12, iOS 15, *)) {
        NSDictionary<NSString *, PHCloudIdentifierMapping *> *mappings = identifiers.count ?
            [PHPhotoLibrary.sharedPhotoLibrary cloudIdentifierMappingsForLocalIdentifiers:identifiers] : @{};
        for (NSMutableDictionary *photo in photos) {
            PHCloudIdentifier *cloud = mappings[photo[@"id"]].cloudIdentifier;
            NSString *key;
            // Read by name: the property exists from macOS 15.2 / iOS 18.2, but an older Xcode SDK
            // (the macOS CI runner's 26.6) has no declaration for it and would fail to compile.
            if (@available(macOS 15.2, iOS 18.2, *)) key = [cloud respondsToSelector:NSSelectorFromString(@"archivalStringValue")] ? [cloud valueForKey:@"archivalStringValue"] : nil;
            else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
                key = cloud.stringValue;
#pragma clang diagnostic pop
            }
            if (key.length != 0 && key.length <= 2048) photo[@"sourceIdentity"] = @{@"globalId": key};
        }
    }
    if (more) [identifiers addObject:assets[offset + limit].localIdentifier];
    if (identifiers.count != 0) {
        PHFetchResult<PHAsset *> *current = [PHAsset fetchAssetsWithLocalIdentifiers:identifiers options:nil];
        if (current.count != identifiers.count) {
            reply(context, AppleNotFound, nullptr, 0);
            return;
        }
        for (NSUInteger index = 0; index < current.count; index++) {
            if (!visiblePhoto(current[index])) {
                reply(context, AppleNotFound, nullptr, 0);
                return;
            }
        }
    }
    if (!hasPhotoAccess()) {
        reply(context, ApplePermissionDenied, nullptr, 0);
        return;
    }
    YonderReplyJSON(context, reply, @{
        @"kind": @"apple_photos_list", @"photos": photos, @"more": @(more),
    });
}

static VNImageRequestHandler *imageRequest(YonderOSImage *image) API_AVAILABLE(macos(10.15), ios(13.0)) {
#if TARGET_OS_OSX
    CGImageRef pixels = [image CGImageForProposedRect:nullptr context:nil hints:nil];
    return pixels == nullptr ? nil : [[VNImageRequestHandler alloc] initWithCGImage:pixels options:@{}];
#else
    if (image.CGImage == nullptr) return nil;
    static const CGImagePropertyOrientation orientations[] = {
        kCGImagePropertyOrientationUp, kCGImagePropertyOrientationDown,
        kCGImagePropertyOrientationLeft, kCGImagePropertyOrientationRight,
        kCGImagePropertyOrientationUpMirrored, kCGImagePropertyOrientationDownMirrored,
        kCGImagePropertyOrientationLeftMirrored, kCGImagePropertyOrientationRightMirrored,
    };
    return [[VNImageRequestHandler alloc] initWithCGImage:image.CGImage
        orientation:orientations[image.imageOrientation] options:@{}];
#endif
}

static void readPhoto(NSString *identifier, void *context, YonderAppleReply reply)
    API_AVAILABLE(macos(10.15), ios(13.0)) {
    PHAsset *asset = [PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil].firstObject;
    if (!visiblePhoto(asset)) {
        reply(context, AppleNotFound, nullptr, 0);
        return;
    }
    // What one picture is read for, and why it is 1280: the model's own reading of a large image
    // loses nothing above that long edge (DeepSeek re-reads everything past ~1300×1300 down to it),
    // and a smaller copy is what makes a library of thousands cheap to look at. The original is
    // never downloaded here: iCloud would spend the owner's 3 Mbps uplink for pixels the model
    // discards. When the local copy is only a thumbnail, that is still enough for OCR and labels.
    YonderApplePhotoFetch fetched = YonderApplePhotoImage(asset, YonderPhotoReadEdge);
    if (fetched.image == nil) {
        // A library that has the asset but no local pixels is not a failure: it is a fact the caller
        // is told, so it can decide to fetch the original from iCloud instead of reporting an error.
        reply(context, fetched.status == AppleOK ? AppleUnavailable : fetched.status, nullptr, 0);
        return;
    }
    VNImageRequestHandler *handler = imageRequest(fetched.image);
    if (handler == nil) {
        reply(context, AppleUnavailable, nullptr, 0);
        return;
    }
    VNRecognizeTextRequest *ocr = [VNRecognizeTextRequest new];
    ocr.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    if (@available(macOS 12.0, iOS 15.0, *)) {
        NSArray<NSString *> *supported = [ocr supportedRecognitionLanguagesAndReturnError:nil];
        NSMutableArray *languages = [NSMutableArray array];
        for (NSString *language in @[@"zh-Hans", @"zh-Hant", @"en-US"]) {
            if ([supported containsObject:language]) [languages addObject:language];
        }
        if (languages.count) ocr.recognitionLanguages = languages;
    }
    VNClassifyImageRequest *classification = [VNClassifyImageRequest new];
    BOOL recognized = [handler performRequests:@[ocr] error:nil];
    BOOL classified = [handler performRequests:@[classification] error:nil];
    if (!recognized && !classified) {
        reply(context, AppleReadFailed, nullptr, 0);
        return;
    }
    NSMutableString *text = [NSMutableString string];
    for (VNRecognizedTextObservation *observation in ocr.results) {
        NSString *line = [observation topCandidates:1].firstObject.string;
        if (line.length == 0) continue;
        [text appendFormat:@"%@%@",
            text.length ? @"\n" : @"", YonderText(line, 8001)];
        if (text.length > 8000) break;
    }
    NSMutableArray<NSString *> *labels = [NSMutableArray arrayWithCapacity:5];
    for (VNClassificationObservation *label in classification.results) {
        if (label.confidence < 0.15f || labels.count == 5) break;
        [labels addObject:YonderText(label.identifier, 100)];
    }
    // A user can narrow the accessible library while Vision is analyzing the image.
    if (!hasPhotoAccess()) {
        reply(context, ApplePermissionDenied, nullptr, 0);
        return;
    }
    if (!visiblePhoto([PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil].firstObject)) {
        reply(context, AppleNotFound, nullptr, 0);
        return;
    }
    YonderReplyJSON(context, reply, @{
        @"kind": @"apple_photos_read", @"id": identifier, @"text": YonderText(text, 8000),
        @"truncated": @(text.length > 8000), @"labels": labels,
        // Thumbnail-only is a fact the caller is told, not a failure: the text is real but a small
        // copy's details may be missing, so the result says which copy was read.
        @"source": fetched.thumbnail ? @"thumbnail" : @"local",
    });
}

// Encodes the fetched image at the read edge as JPEG for a model to look at (D3). Uses ImageIO so
// the encode happens without decoding the full original again; orientation is applied by the
// thumbnail transform, and EXIF (including where the photo was taken) never travels.
static NSData *encodePhotoJPEG(YonderOSImage *image) API_AVAILABLE(macos(10.15), ios(13.0)) {
#if TARGET_OS_OSX
    CGImageRef pixels = [image CGImageForProposedRect:nullptr context:nil hints:nil];
#else
    // The UIImage from PhotoKit is already at the requested edge.
    CGImageRef pixels = image.CGImage;
#endif
    if (pixels == nullptr) return nil;
    NSMutableData *result = [NSMutableData data];
    CGImageDestinationRef target = CGImageDestinationCreateWithData((__bridge CFMutableDataRef)result,
        (__bridge CFStringRef)UTTypeJPEG.identifier, 1, nullptr);
    if (target == nullptr) return nil;
    CGImageDestinationAddImage(target, pixels, (__bridge CFDictionaryRef)@{
        (__bridge NSString *)kCGImageDestinationLossyCompressionQuality: @0.82,
    });
    BOOL encoded = CGImageDestinationFinalize(target);
    CFRelease(target);
    return encoded ? result : nil;
}

static void imagePhoto(NSString *identifier, CGFloat edge, void *context, YonderAppleReply reply)
    API_AVAILABLE(macos(10.15), ios(13.0)) {
    PHAsset *asset = [PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil].firstObject;
    if (!visiblePhoto(asset)) {
        reply(context, AppleNotFound, nullptr, 0);
        return;
    }
    YonderApplePhotoFetch fetched = YonderApplePhotoImage(asset, edge);
    if (fetched.image == nil) {
        reply(context, fetched.status == AppleOK ? AppleUnavailable : fetched.status, nullptr, 0);
        return;
    }
    NSData *jpeg = encodePhotoJPEG(fetched.image);
    if (jpeg.length == 0) {
        reply(context, AppleReadFailed, nullptr, 0);
        return;
    }
    if (!hasPhotoAccess() || !visiblePhoto([PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil].firstObject)) {
        reply(context, AppleNotFound, nullptr, 0);
        return;
    }
    YonderReplyAttachment(context, reply, YonderText([identifier lastPathComponent], 200), @"image/jpeg", jpeg);
}

extern "C" void yonder_apple_photos_execute(bool read, const char *argsJSON, void *context, YonderAppleReply reply) {
    NSData *bytes = [NSData dataWithBytes:argsJSON length:strlen(argsJSON)];
    NSDictionary *args = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        if (!hasPhotoAccess()) {
            reply(context, ApplePermissionDenied, nullptr, 0);
            return;
        }
        if (@available(macOS 10.15, iOS 13.0, *)) {
            if (read) readPhoto(args[@"id"], context, reply);
            else listPhotos(args, context, reply);
        } else {
            reply(context, AppleUnavailable, nullptr, 0);
        }
    });
}

// The picture side of `apple_photos_image`: the same fetch as `readPhoto`, handed back as a JPEG
// through the attachment reply so it can travel on the device's existing file-upload channel.
extern "C" void yonder_apple_photos_image(const char *argsJSON, void *context, YonderAppleReply reply) {
    NSData *bytes = [NSData dataWithBytes:argsJSON length:strlen(argsJSON)];
    NSDictionary *args = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        if (!hasPhotoAccess()) {
            reply(context, ApplePermissionDenied, nullptr, 0);
            return;
        }
        if (@available(macOS 10.15, iOS 13.0, *)) {
            // The server names the edge (512 for a batch, 1280 for one photo); anything else is this
            // build's own read edge, which is the same 1280.
            NSNumber *requested = args[@"edge"];
            CGFloat edge = [requested isKindOfClass:NSNumber.class] ? (CGFloat)requested.doubleValue : YonderPhotoReadEdge;
            imagePhoto(args[@"id"], edge > 0 ? edge : YonderPhotoReadEdge, context, reply);
        }
        else reply(context, AppleUnavailable, nullptr, 0);
    });
}

#if TARGET_OS_IOS
// Local metadata only. This never calls image/OCR or asks for PhotoKit access.
static std::atomic<uint64_t> photoDeltaEpoch{0};
static dispatch_queue_t photoDeltaQueue() {
    static dispatch_queue_t queue = dispatch_queue_create("dev.yonder.photo-delta",
        dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_UTILITY, 0));
    return queue;
}

static NSURL *photoDeltaDirectory() {
    NSURL *support = [NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory
        inDomains:NSUserDomainMask].firstObject;
    return [support URLByAppendingPathComponent:@"YonderPhotoHistory" isDirectory:YES];
}

static void purgePhotoDelta() {
    NSURL *directory = photoDeltaDirectory();
    if (directory != nil) [NSFileManager.defaultManager removeItemAtURL:directory error:nullptr];
}

static BOOL historyInvalid(NSError *error) API_AVAILABLE(ios(16.0)) {
    return [error.domain isEqualToString:PHPhotosErrorDomain] &&
        (error.code == PHPhotosErrorPersistentChangeTokenExpired ||
            error.code == PHPhotosErrorPersistentChangeDetailsUnavailable);
}

static NSDictionary *visibleRefs(PHFetchResult<PHAsset *> *assets) {
    NSMutableDictionary *refs = [NSMutableDictionary dictionary];
    [assets enumerateObjectsUsingBlock:^(PHAsset *asset, NSUInteger, BOOL *) {
        if (visiblePhoto(asset)) {
            refs[asset.localIdentifier] = @[@(asset.creationDate.timeIntervalSince1970),
                @(asset.modificationDate.timeIntervalSince1970)];
        }
    }];
    return refs;
}

static NSDictionary *loadPhotoDelta(NSURL *file) {
    NSNumber *size = nil;
    if (![file getResourceValue:&size forKey:NSURLFileSizeKey error:nullptr] || size.unsignedIntegerValue > 262144)
        return nil;
    NSData *data = [NSData dataWithContentsOfURL:file];
    if (data == nil) return nil;
    id stored = [NSPropertyListSerialization propertyListWithData:data options:NSPropertyListImmutable
        format:nullptr error:nullptr];
    return [stored isKindOfClass:NSDictionary.class] ? stored : nil;
}

static NSDictionary *nextPhotoDelta(NSDictionary *saved, NSString *scope, int32_t status)
    API_AVAILABLE(ios(16.0)) {
    PHPhotoLibrary *library = PHPhotoLibrary.sharedPhotoLibrary;
    NSDictionary *current = YonderPhotoDeltaCurrent(saved, scope, status);
    // Limited selections can change without reliably appearing in persistent asset history.
    PHPersistentChangeToken *cursor = status == AppleGranted && current != nil
        ? [NSKeyedUnarchiver unarchivedObjectOfClass:PHPersistentChangeToken.class
            fromData:current[@"token"] error:nullptr] : nil;
    NSDictionary *refs = nil;
    if (cursor != nil) {
        NSError *error = nil;
        PHPersistentChangeFetchResult *changes = [library fetchPersistentChangesSinceToken:cursor error:&error];
        if (changes == nil && !historyInvalid(error)) return nil;
        if (changes != nil) {
            NSMutableSet<NSString *> *ids = [NSMutableSet setWithArray:[current[@"refs"] allKeys]];
            __block PHPersistentChangeToken *last = cursor;
            __block BOOL baseline = NO;
            __block BOOL failed = NO;
            __block NSUInteger records = 0;
            [changes enumerateChangesWithBlock:^(PHPersistentChange *change, BOOL *stop) {
                NSError *detailsError = nil;
                PHPersistentObjectChangeDetails *details = [change changeDetailsForObjectType:PHObjectTypeAsset
                    error:&detailsError];
                NSUInteger count = details.insertedLocalIdentifiers.count + details.updatedLocalIdentifiers.count
                    + details.deletedLocalIdentifiers.count;
                if (detailsError != nil || ++records > 512 || ids.count + count > 1024) {
                    baseline = detailsError == nil || historyInvalid(detailsError);
                    failed = !baseline;
                    *stop = YES;
                    return;
                }
                if (details != nil) {
                    [ids minusSet:details.deletedLocalIdentifiers];
                    [ids unionSet:details.insertedLocalIdentifiers];
                    [ids unionSet:details.updatedLocalIdentifiers];
                }
                last = change.changeToken;
            }];
            if (failed) return nil;
            if (!baseline) {
                // Never retain a reference just because an ID was present in the history.
                refs = ids.count ? visibleRefs([PHAsset fetchAssetsWithLocalIdentifiers:ids.allObjects options:nil]) : @{};
                cursor = last;
            }
        }
    }
    if (refs == nil) {
        // Take the baseline cursor first: concurrent changes are replayed next time, never skipped.
        cursor = library.currentChangeToken;
        PHFetchOptions *options = [PHFetchOptions new];
        options.includeHiddenAssets = NO;
        options.fetchLimit = YonderPhotoRefLimit;
        options.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
        refs = visibleRefs([PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:options]);
    }
    NSData *token = cursor == nil ? nil
        : [NSKeyedArchiver archivedDataWithRootObject:cursor requiringSecureCoding:YES error:nullptr];
    return YonderPhotoDeltaCheckpoint(scope, status, token, refs);
}

// 0: suspend; 1: refresh only in the foreground (nil scope means inaccessible); 2: revoke and purge.
extern "C" void yonder_ios_photo_delta(int32_t mode, const char *scopeUTF8) {
    uint64_t epoch = photoDeltaEpoch.fetch_add(1) + 1;
    if (mode == 0) return;
    if (mode == 2) {
        dispatch_async(photoDeltaQueue(), ^{ purgePhotoDelta(); });
        return;
    }
    NSString *scope = scopeUTF8 == nullptr ? nil : [NSString stringWithUTF8String:scopeUTF8];
    dispatch_async(dispatch_get_main_queue(), ^{
        if (epoch != photoDeltaEpoch.load() || UIApplication.sharedApplication.applicationState != UIApplicationStateActive)
            return;
        dispatch_async(photoDeltaQueue(), ^{
            @autoreleasepool {
                if (epoch != photoDeltaEpoch.load()) return;
                int32_t status = yonder_apple_photos_status();
                if (scope == nil || (status != AppleGranted && status != AppleLimited)) {
                    purgePhotoDelta();
                    return;
                }
                if (@available(iOS 16.0, *)) {
                    NSURL *directory = photoDeltaDirectory();
                    NSURL *file = [directory URLByAppendingPathComponent:@"state.plist" isDirectory:NO];
                    if (file == nil) return;
                    NSDictionary *old = loadPhotoDelta(file);
                    if (old != nil && YonderPhotoDeltaCurrent(old, scope, status) == nil) {
                        purgePhotoDelta();
                        old = nil;
                    }
                    NSDictionary *next = nextPhotoDelta(old, scope, status);
                    if (epoch != photoDeltaEpoch.load()) return;
                    if (yonder_apple_photos_status() != status) {
                        purgePhotoDelta();
                        return;
                    }
                    if (next == nil || [next isEqual:old]) return;
                    NSData *data = [NSPropertyListSerialization dataWithPropertyList:next
                        format:NSPropertyListBinaryFormat_v1_0 options:0 error:nullptr];
                    if (data == nil || data.length > 262144) return;
                    if ([NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES
                            attributes:@{NSFileProtectionKey: NSFileProtectionComplete} error:nullptr] &&
                        [directory setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nullptr]) {
                        [data writeToURL:file options:NSDataWritingAtomic | NSDataWritingFileProtectionComplete error:nullptr];
                    }
                }
            }
        });
    });
}
#endif
