#import <AVFoundation/AVFoundation.h>
#import <Photos/Photos.h>
#import <PhotosUI/PhotosUI.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

using PickCallback = void (*)(void *, const char *);
using DataCallback = void (*)(void *, const void *, size_t);
typedef void (^PickCompletion)(NSDictionary *);
static char pickerKey;
static char photoObserverKey;
static const NSUInteger maxFileBytes = 20 * 1024 * 1024;

// The Tauri Channel evaluates JavaScript using the WebView. Leave with_webview's dispatcher
// before sending any events, including the immediate import and cancellation notifications.
static void replyPick(void *context, PickCallback callback, NSDictionary *result) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSData *data = result ? [NSJSONSerialization dataWithJSONObject:result options:0 error:nil] : nil;
        NSString *json = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : nil;
        callback(context, json.UTF8String);
    });
}

static BOOL hasPhotoAccess() {
    PHAuthorizationStatus status = [PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
    return status == PHAuthorizationStatusAuthorized || status == PHAuthorizationStatusLimited;
}

static PHAsset *accessiblePhoto(NSString *identifier) {
    if (!hasPhotoAccess() || !identifier.length) return nil;
    PHAsset *asset = [PHAsset fetchAssetsWithLocalIdentifiers:@[identifier] options:nil].firstObject;
    return asset.mediaType == PHAssetMediaTypeImage && !asset.hidden ? asset : nil;
}

static void replyData(void *context, DataCallback reply, NSData *data) {
    static const uint8_t empty = 0;
    reply(context, data ? (data.length ? data.bytes : &empty) : nullptr, data.length);
}

@interface YonderChatPhotoObserver : NSObject <PHPhotoLibraryChangeObserver>
@property(nonatomic, weak) WKWebView *webView;
@end

@implementation YonderChatPhotoObserver
- (void)photoLibraryDidChange:(PHChange *)change {
    (void)change;
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:@"window.dispatchEvent(new Event('yonder-ios-photo-library-change'))"
            completionHandler:nil];
    });
}

- (void)dealloc {
    [PHPhotoLibrary.sharedPhotoLibrary unregisterChangeObserver:self];
}
@end

extern "C" void yonder_ios_observe_chat_photos(void *webview) {
    WKWebView *view = (__bridge WKWebView *)webview;
    if (objc_getAssociatedObject(view, &photoObserverKey)) return;
    YonderChatPhotoObserver *observer = [YonderChatPhotoObserver new];
    observer.webView = view;
    [PHPhotoLibrary.sharedPhotoLibrary registerChangeObserver:observer];
    objc_setAssociatedObject(view, &photoObserverKey, observer, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

static PHFetchOptions *imageOptions() {
    PHFetchOptions *options = [PHFetchOptions new];
    options.predicate = [NSPredicate predicateWithFormat:@"mediaType == %d", PHAssetMediaTypeImage];
    return options;
}

extern "C" void yonder_ios_chat_photo_albums(void *context, DataCallback reply) {
    // Limited access grants individual photos, without exposing the user's album names.
    if ([PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite] != PHAuthorizationStatusAuthorized) {
        replyData(context, reply, [@"[]" dataUsingEncoding:NSUTF8StringEncoding]);
        return;
    }
    PHFetchOptions *options = imageOptions();
    options.fetchLimit = 1;
    NSMutableArray *albums = [NSMutableArray array];
    PHFetchResult<PHAssetCollection *> *collections = [PHAssetCollection fetchAssetCollectionsWithType:
        PHAssetCollectionTypeAlbum subtype:PHAssetCollectionSubtypeAny options:nil];
    for (PHAssetCollection *album in collections) {
        if (album.localizedTitle.length && [PHAsset fetchAssetsInAssetCollection:album options:options].count) {
            [albums addObject:@{ @"id": album.localIdentifier, @"title": album.localizedTitle }];
        }
    }
    if ([PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite] != PHAuthorizationStatusAuthorized) {
        [albums removeAllObjects];
    }
    NSArray *sorted = [albums sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
        return [left[@"title"] localizedStandardCompare:right[@"title"]];
    }];
    replyData(context, reply, [NSJSONSerialization dataWithJSONObject:sorted options:0 error:nil]);
}

extern "C" void yonder_ios_chat_photo_page(const char *albumId, unsigned int offset, unsigned int limit,
                                           void *context, DataCallback reply) {
    if (!hasPhotoAccess()) {
        replyData(context, reply, nil);
        return;
    }
    PHFetchOptions *options = imageOptions();
    options.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
    options.fetchLimit = (NSUInteger)offset + limit + 1;
    PHFetchResult<PHAsset *> *photos;
    if (albumId) {
        if ([PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite] != PHAuthorizationStatusAuthorized) {
            replyData(context, reply, nil);
            return;
        }
        NSString *identifier = [NSString stringWithUTF8String:albumId];
        PHAssetCollection *album = [PHAssetCollection fetchAssetCollectionsWithLocalIdentifiers:@[identifier] options:nil].firstObject;
        photos = album ? [PHAsset fetchAssetsInAssetCollection:album options:options] : nil;
    } else {
        photos = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:options];
    }
    NSMutableArray *assets = [NSMutableArray arrayWithCapacity:limit];
    NSMutableArray<NSString *> *ids = [NSMutableArray arrayWithCapacity:limit];
    for (NSUInteger index = offset; index < MIN(photos.count, (NSUInteger)offset + limit); ++index) {
        PHAsset *photo = photos[index];
        [ids addObject:photo.localIdentifier];
        [assets addObject:@{
            @"id": photo.localIdentifier,
            @"createdAt": photo.creationDate ? @(photo.creationDate.timeIntervalSince1970 * 1000) : NSNull.null,
        }];
    }
    // A Settings change can narrow the accessible library while a page is being read.
    if (!hasPhotoAccess() ||
        (albumId && [PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite] != PHAuthorizationStatusAuthorized) ||
        (ids.count && [PHAsset fetchAssetsWithLocalIdentifiers:ids options:nil].count != ids.count)) {
        replyData(context, reply, nil);
        return;
    }
    NSDictionary *page = @{ @"assets": assets, @"more": @(photos.count > (NSUInteger)offset + limit) };
    replyData(context, reply, [NSJSONSerialization dataWithJSONObject:page options:0 error:nil]);
}

extern "C" void yonder_ios_chat_photo_thumbnail(const char *assetId, bool preview, void *context, DataCallback reply) {
    NSString *identifier = [NSString stringWithUTF8String:assetId];
    PHAsset *asset = accessiblePhoto(identifier);
    if (!asset) {
        replyData(context, reply, NSData.data);
        return;
    }
    PHImageRequestOptions *options = [PHImageRequestOptions new];
    options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
    options.resizeMode = PHImageRequestOptionsResizeModeExact;
    options.networkAccessAllowed = YES;
    static PHCachingImageManager *manager;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ manager = [PHCachingImageManager new]; });
    CGFloat size = preview ? 1280 : 360;
    [manager requestImageForAsset:asset targetSize:CGSizeMake(size, size)
        contentMode:preview ? PHImageContentModeAspectFit : PHImageContentModeAspectFill options:options
        resultHandler:^(UIImage *image, NSDictionary *info) {
            if ([info[PHImageResultIsDegradedKey] boolValue]) return;
            NSData *jpeg = image && accessiblePhoto(identifier) ? UIImageJPEGRepresentation(image, 0.83) : nil;
            replyData(context, reply, jpeg ?: NSData.data);
        }];
}

extern "C" void yonder_ios_manage_chat_photo_access(void *webview, void *context, DataCallback reply) {
    if ([PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite] == PHAuthorizationStatusLimited) {
        WKWebView *view = (__bridge WKWebView *)webview;
        UIViewController *parent = view.window.rootViewController;
        if (!parent || parent.presentedViewController) {
            replyData(context, reply, nil);
            return;
        }
        [PHPhotoLibrary.sharedPhotoLibrary presentLimitedLibraryPickerFromViewController:parent
            completionHandler:^(NSArray<NSString *> *) { replyData(context, reply, NSData.data); }];
    } else {
        NSURL *settings = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
        [UIApplication.sharedApplication openURL:settings options:@{} completionHandler:^(BOOL opened) {
            replyData(context, reply, opened ? NSData.data : nil);
        }];
    }
}

@interface YonderChatAttachmentPicker : NSObject <UIImagePickerControllerDelegate, UINavigationControllerDelegate, UIDocumentPickerDelegate>
@property(nonatomic, weak) WKWebView *webView;
@property(nonatomic, copy) NSString *session;
@property(nonatomic, copy) NSString *directory;
@property(nonatomic) NSUInteger limit;
@property(nonatomic, strong) UIViewController *picker;
@property(nonatomic) PHAssetResourceDataRequestID resourceRequest;
@property(nonatomic, copy) PickCompletion completion;
@property(nonatomic, strong) NSMutableArray<NSDictionary *> *files;
@property(nonatomic, copy) NSString *issue;
@end

@implementation YonderChatAttachmentPicker
- (void)closePicker {
    [self.picker dismissViewControllerAnimated:YES completion:nil];
    self.picker = nil;
}

- (void)finish:(BOOL)cancelled {
    PickCompletion complete = self.completion;
    if (!complete) return;
    self.completion = nil;
    if (self.resourceRequest) {
        [PHAssetResourceManager.defaultManager cancelDataRequest:self.resourceRequest];
        self.resourceRequest = PHInvalidAssetResourceDataRequestID;
    }
    [self closePicker];
    if (objc_getAssociatedObject(self.webView, &pickerKey) == self) {
        objc_setAssociatedObject(self.webView, &pickerKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    complete(cancelled ? @{} : @{ @"files": self.files, @"issue": self.issue ?: NSNull.null });
}

- (NSURL *)outputAt:(NSUInteger)index {
    return [NSURL fileURLWithPath:[self.directory stringByAppendingPathComponent:@(index).stringValue]];
}

- (NSDictionary *)stagedFile:(NSUInteger)index name:(NSString *)name type:(UTType *)type {
    return @{ @"index": @(index), @"name": name.length ? name.lastPathComponent : @"attachment",
              @"mime": type.preferredMIMEType ?: @"application/octet-stream" };
}

// Copies synchronously while the system picker grants access to the selected URL.
- (NSDictionary *)stageURL:(NSURL *)url name:(NSString *)name index:(NSUInteger)index {
    if (!url.isFileURL) return @{ @"issue": @"pickFailed" };
    NSDictionary *values = [url resourceValuesForKeys:@[NSURLIsRegularFileKey, NSURLFileSizeKey, NSURLContentTypeKey]
                                               error:nil];
    NSNumber *size = values[NSURLFileSizeKey];
    if (![values[NSURLIsRegularFileKey] boolValue] || !size) return @{ @"issue": @"pickFailed" };
    if (size.unsignedLongLongValue > maxFileBytes) return @{ @"issue": @"fileTooLarge" };
    if (![NSFileManager.defaultManager copyItemAtURL:url toURL:[self outputAt:index] error:nil]) {
        return @{ @"issue": @"pickFailed" };
    }
    NSString *filename = name.length ? name.lastPathComponent : url.lastPathComponent;
    NSString *extension = url.pathExtension;
    UTType *type = values[NSURLContentTypeKey];
    if (!type.preferredMIMEType && extension.length) type = [UTType typeWithFilenameExtension:extension];
    return [self stagedFile:index name:filename type:type];
}

- (void)record:(NSDictionary *)item {
    NSString *issue = item[@"issue"];
    if (issue) {
        if (!self.issue || [issue isEqualToString:@"fileTooLarge"]) self.issue = issue;
    } else {
        [self.files addObject:item];
    }
}

- (void)importLibraryPhoto:(NSString *)identifier completion:(void (^)(NSDictionary *))done {
    PHAsset *asset = accessiblePhoto(identifier);
    PHAssetResource *resource = nil;
    if (asset) {
        for (PHAssetResource *candidate in [PHAssetResource assetResourcesForAsset:asset]) {
            if (candidate.type == PHAssetResourceTypeFullSizePhoto) {
                resource = candidate;
                break;
            }
            if (candidate.type == PHAssetResourceTypePhoto) resource = candidate;
        }
    }
    if (!resource) {
        done(@{ @"issue": @"pickFailed" });
        return;
    }
    NSUInteger index = self.files.count;
    NSMutableData *buffer = [NSMutableData data];
    PHAssetResourceRequestOptions *options = [PHAssetResourceRequestOptions new];
    options.networkAccessAllowed = YES;
    PHAssetResourceManager *manager = PHAssetResourceManager.defaultManager;
    __block PHAssetResourceDataRequestID request = PHInvalidAssetResourceDataRequestID;
    __block BOOL tooLarge = NO;
    PHAssetResourceDataRequestID started = [manager requestDataForAssetResource:resource options:options
        dataReceivedHandler:^(NSData *data) {
            PHAssetResourceDataRequestID cancel = PHInvalidAssetResourceDataRequestID;
            @synchronized (buffer) {
                if (tooLarge) return;
                if (data.length > maxFileBytes - buffer.length) {
                    tooLarge = YES;
                    cancel = request;
                } else {
                    [buffer appendData:data];
                }
            }
            if (cancel) [manager cancelDataRequest:cancel];
        } completionHandler:^(NSError *error) {
            NSDictionary *item = nil;
            @synchronized (buffer) {
                if (tooLarge) item = @{ @"issue": @"fileTooLarge" };
            }
            if (!item) {
                if (error || !accessiblePhoto(identifier) || ![buffer writeToURL:[self outputAt:index] options:0 error:nil]) {
                    item = @{ @"issue": @"pickFailed" };
                } else {
                    item = [self stagedFile:index name:resource.originalFilename
                        type:[UTType typeWithIdentifier:resource.uniformTypeIdentifier]];
                }
            }
            dispatch_async(dispatch_get_main_queue(), ^{
                self.resourceRequest = PHInvalidAssetResourceDataRequestID;
                if (self.completion) done(item);
            });
        }];
    self.resourceRequest = started;
    @synchronized (buffer) {
        request = started;
        if (!tooLarge) return;
    }
    if (started) [manager cancelDataRequest:started];
}

- (void)importPhotos:(NSArray<NSString *> *)photos at:(NSUInteger)index {
    if (!self.completion) return;
    if (index == photos.count) {
        [self finish:NO];
        return;
    }
    [self importLibraryPhoto:photos[index] completion:^(NSDictionary *item) {
        if (!self.completion) return;
        [self record:item];
        [self importPhotos:photos at:index + 1];
    }];
}

- (void)showCamera:(UIViewController *)parent {
    if (![UIImagePickerController isSourceTypeAvailable:UIImagePickerControllerSourceTypeCamera]) {
        self.issue = @"cameraUnavailable";
        [self finish:NO];
        return;
    }
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
    if (status == AVAuthorizationStatusNotDetermined) {
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (!self.completion) return;
                if (granted) [self showCamera:parent];
                else {
                    self.issue = @"cameraDenied";
                    [self finish:NO];
                }
            });
        }];
        return;
    }
    if (status != AVAuthorizationStatusAuthorized) {
        self.issue = @"cameraDenied";
        [self finish:NO];
        return;
    }
    UIImagePickerController *camera = [UIImagePickerController new];
    camera.sourceType = UIImagePickerControllerSourceTypeCamera;
    camera.mediaTypes = @[UTTypeImage.identifier];
    camera.delegate = self;
    camera.modalPresentationStyle = UIModalPresentationFullScreen;
    self.picker = camera;
    [parent presentViewController:camera animated:YES completion:nil];
}

- (void)imagePickerControllerDidCancel:(UIImagePickerController *)picker {
    if (picker == self.picker) [self finish:YES];
}

- (void)imagePickerController:(UIImagePickerController *)picker didFinishPickingMediaWithInfo:(NSDictionary<UIImagePickerControllerInfoKey,id> *)info {
    if (picker != self.picker) return;
    self.completion(@{ @"importing": @YES });
    [self closePicker];
    UIImage *image = info[UIImagePickerControllerOriginalImage];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSData *jpeg = image ? UIImageJPEGRepresentation(image, 0.95) : nil;
        NSDictionary *item;
        if (jpeg.length > maxFileBytes) item = @{ @"issue": @"fileTooLarge" };
        else if (![jpeg writeToURL:[self outputAt:0] options:0 error:nil]) item = @{ @"issue": @"pickFailed" };
        else item = [self stagedFile:0 name:@"Photo.jpg" type:UTTypeJPEG];
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!self.completion) return;
            [self record:item];
            [self finish:NO];
        });
    });
}

- (void)documentPicker:(UIDocumentPickerViewController *)picker didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls {
    if (picker != self.picker) return;
    self.completion(@{ @"importing": @YES });
    [self closePicker];
    NSUInteger limit = self.limit;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSMutableArray<NSDictionary *> *items = [NSMutableArray array];
        NSUInteger index = 0;
        for (NSURL *url in urls) {
            if (index == limit) {
                [items addObject:@{ @"issue": @"tooManyFiles" }];
                break;
            }
            if (![NSFileManager.defaultManager fileExistsAtPath:self.directory]) break;
            BOOL access = [url startAccessingSecurityScopedResource];
            NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
            __block NSDictionary *item;
            [coordinator coordinateReadingItemAtURL:url options:0 error:nil byAccessor:^(NSURL *accessibleURL) {
                item = [self stageURL:accessibleURL name:url.lastPathComponent index:index];
            }];
            if (access) [url stopAccessingSecurityScopedResource];
            [items addObject:item ?: @{ @"issue": @"pickFailed" }];
            if (item && !item[@"issue"]) ++index;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!self.completion) return;
            for (NSDictionary *item in items) [self record:item];
            [self finish:NO];
        });
    });
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)picker {
    if (picker == self.picker) [self finish:YES];
}
@end

extern "C" void yonder_ios_pick_chat_attachments(void *webview, const char *session, const char *directory,
                                                  bool documents, bool camera, const char *photoIdsJSON,
                                                  unsigned int limit, void *context, PickCallback callback) {
    WKWebView *view = (__bridge WKWebView *)webview;
    YonderChatAttachmentPicker *previous = objc_getAssociatedObject(view, &pickerKey);
    [previous finish:YES];
    UIViewController *parent = view.window.rootViewController;
    if (!parent || parent.viewIfLoaded.window == nil || parent.presentedViewController) {
        replyPick(context, callback, nil);
        return;
    }
    NSData *encoded = [NSData dataWithBytes:photoIdsJSON length:strlen(photoIdsJSON)];
    NSArray<NSString *> *photoIds = [NSJSONSerialization JSONObjectWithData:encoded options:0 error:nil];
    YonderChatAttachmentPicker *sessionPicker = [YonderChatAttachmentPicker new];
    sessionPicker.webView = view;
    sessionPicker.session = [NSString stringWithUTF8String:session];
    sessionPicker.directory = [NSString stringWithUTF8String:directory];
    sessionPicker.limit = limit;
    sessionPicker.files = [NSMutableArray array];
    sessionPicker.completion = ^(NSDictionary *result) { replyPick(context, callback, result); };
    objc_setAssociatedObject(view, &pickerKey, sessionPicker, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    if (documents) {
        UIDocumentPickerViewController *picker = [[UIDocumentPickerViewController alloc]
            initForOpeningContentTypes:@[UTTypeItem] asCopy:NO];
        picker.allowsMultipleSelection = limit > 1;
        picker.delegate = sessionPicker;
        sessionPicker.picker = picker;
    } else if (camera) {
        [sessionPicker showCamera:parent];
        return;
    } else {
        sessionPicker.completion(@{ @"importing": @YES });
        [sessionPicker importPhotos:photoIds at:0];
        return;
    }
    sessionPicker.picker.modalPresentationStyle = UIModalPresentationFullScreen;
    [parent presentViewController:sessionPicker.picker animated:YES completion:nil];
}

extern "C" void yonder_ios_close_chat_attachments(void *webview, const char *session) {
    WKWebView *view = (__bridge WKWebView *)webview;
    YonderChatAttachmentPicker *picker = objc_getAssociatedObject(view, &pickerKey);
    if ([picker.session isEqualToString:[NSString stringWithUTF8String:session]]) [picker finish:YES];
}
