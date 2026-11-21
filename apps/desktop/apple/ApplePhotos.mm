#import "AppleResourceBridge.h"
#import <Photos/Photos.h>
#import <Vision/Vision.h>

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
    PHImageRequestOptions *options = [PHImageRequestOptions new];
    options.synchronous = YES;
    options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
    options.resizeMode = PHImageRequestOptionsResizeModeExact;
    options.networkAccessAllowed = NO;
    __block YonderOSImage *image = nil;
    [[PHImageManager defaultManager] requestImageForAsset:asset targetSize:CGSizeMake(2048, 2048)
        contentMode:PHImageContentModeAspectFit options:options
        resultHandler:^(YonderOSImage *candidate, NSDictionary *) { image = candidate; }];
    VNImageRequestHandler *handler = image == nil ? nil : imageRequest(image);
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
    });
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
