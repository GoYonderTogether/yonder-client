#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <AVFoundation/AVFoundation.h>
#import <ServiceManagement/ServiceManagement.h>

@interface YonderPermissionAppTile : NSView <NSDraggingSource>
@property(nonatomic, strong) NSURL *bundleURL;
@property(nonatomic, strong) NSImage *appIcon;
@end

@implementation YonderPermissionAppTile
- (BOOL)acceptsFirstMouse:(NSEvent *)event { return YES; }

- (NSView *)hitTest:(NSPoint)point { return [super hitTest:point] ? self : nil; }

- (void)mouseDragged:(NSEvent *)event {
    if (!self.bundleURL.isFileURL) return;
    NSDraggingItem *item = [[NSDraggingItem alloc] initWithPasteboardWriter:self.bundleURL];
    NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
    [item setDraggingFrame:NSMakeRect(point.x - 22, point.y - 22, 44, 44) contents:self.appIcon];
    [self beginDraggingSessionWithItems:@[item] event:event source:self];
}

- (NSDragOperation)draggingSession:(NSDraggingSession *)session
    sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
    return NSDragOperationCopy;
}
@end

@interface YonderPermissionGuide : NSPanel
@property(nonatomic, strong) NSURL *settingsURL;
- (void)openSettings:(id)sender;
@end

@implementation YonderPermissionGuide
- (void)openSettings:(id)sender {
    [NSWorkspace.sharedWorkspace openURL:self.settingsURL];
}
@end

namespace {
NSURL *systemSettingsURL(NSString *pane) {
    return [NSURL URLWithString:[@"x-apple.systempreferences:" stringByAppendingString:pane]];
}

bool openSystemSettings(NSString *pane) {
    return [NSWorkspace.sharedWorkspace openURL:systemSettingsURL(pane)];
}

BOOL isAppBundle() {
    return [NSBundle.mainBundle.bundleURL.pathExtension isEqualToString:@"app"];
}

bool openPermissionGuide(NSString *pane, NSString *title, NSString *instruction, bool dragApp) {
    if (!NSThread.isMainThread) {
        __block bool opened;
        dispatch_sync(dispatch_get_main_queue(), ^{
            opened = openPermissionGuide(pane, title, instruction, dragApp);
        });
        return opened;
    }

    static YonderPermissionGuide *guide;
    if (guide == nil) {
        guide = [[YonderPermissionGuide alloc] initWithContentRect:NSMakeRect(0, 0, 332, 100)
            styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskUtilityWindow |
                NSWindowStyleMaskNonactivatingPanel
            backing:NSBackingStoreBuffered defer:NO];
        guide.releasedWhenClosed = NO;
        guide.floatingPanel = YES;
        guide.hidesOnDeactivate = NO;
        guide.becomesKeyOnlyIfNeeded = YES;
        guide.collectionBehavior = NSWindowCollectionBehaviorMoveToActiveSpace |
            NSWindowCollectionBehaviorFullScreenAuxiliary;
    }

    guide.title = title;
    guide.settingsURL = systemSettingsURL(pane);
    BOOL chinese = [NSLocale.preferredLanguages.firstObject hasPrefix:@"zh"];
    NSStackView *body = [NSStackView stackViewWithViews:@[]];
    body.orientation = NSUserInterfaceLayoutOrientationVertical;
    body.alignment = NSLayoutAttributeLeading;
    body.spacing = 12;
    body.edgeInsets = NSEdgeInsetsMake(14, 16, 14, 16);

    NSTextField *steps = [NSTextField wrappingLabelWithString:instruction];
    [steps.widthAnchor constraintEqualToConstant:300].active = YES;
    [body addArrangedSubview:steps];

    if (dragApp && isAppBundle()) {
        YonderPermissionAppTile *tile = [[YonderPermissionAppTile alloc] init];
        tile.bundleURL = NSBundle.mainBundle.bundleURL;
        tile.appIcon = [NSWorkspace.sharedWorkspace iconForFile:tile.bundleURL.path];
        tile.wantsLayer = YES;
        tile.layer.cornerRadius = 8;
        tile.layer.backgroundColor = NSColor.controlBackgroundColor.CGColor;
        [tile.widthAnchor constraintEqualToConstant:300].active = YES;
        [tile.heightAnchor constraintEqualToConstant:52].active = YES;

        NSImageView *icon = [NSImageView imageViewWithImage:tile.appIcon];
        NSTextField *name = [NSTextField labelWithString:chinese ? @"拖动 Yonder.app" : @"Drag Yonder.app"];
        NSStackView *row = [NSStackView stackViewWithViews:@[icon, name]];
        row.spacing = 10;
        row.alignment = NSLayoutAttributeCenterY;
        row.translatesAutoresizingMaskIntoConstraints = NO;
        [tile addSubview:row];
        [NSLayoutConstraint activateConstraints:@[
            [icon.widthAnchor constraintEqualToConstant:32],
            [icon.heightAnchor constraintEqualToConstant:32],
            [row.leadingAnchor constraintEqualToAnchor:tile.leadingAnchor constant:10],
            [row.centerYAnchor constraintEqualToAnchor:tile.centerYAnchor],
        ]];
        [body addArrangedSubview:tile];
    }

    NSButton *settings = [NSButton buttonWithTitle:chinese ? @"打开系统设置" : @"Open System Settings"
        target:guide action:@selector(openSettings:)];
    [body addArrangedSubview:settings];

    guide.contentView = body;
    [guide setContentSize:body.fittingSize];
    NSRect screen = NSScreen.mainScreen.visibleFrame;
    [guide setFrameTopLeftPoint:NSMakePoint(NSMaxX(screen) - NSWidth(guide.frame) - 20, NSMaxY(screen) - 64)];
    bool opened = [NSWorkspace.sharedWorkspace openURL:guide.settingsURL];
    [guide orderFrontRegardless];
    return opened;
}
}

extern "C" bool yonder_mac_open_permissions(int permission) {
    BOOL chinese = [NSLocale.preferredLanguages.firstObject hasPrefix:@"zh"];
    NSString *dragSteps = chinese
        ? @"把下方的 Yonder.app 拖入系统设置列表，然后打开开关。如果 Yonder 已在列表中，直接打开开关。"
        : @"Drag Yonder.app into the list in System Settings, then turn it on. If Yonder is already listed, turn it on there.";
    switch (permission) {
        case 0:
            return openPermissionGuide(@"com.apple.preference.security?Privacy_AllFiles",
                chinese ? @"完全磁盘访问权限" : @"Full Disk Access", dragSteps, true);
        case 1:
            return openPermissionGuide(@"com.apple.preference.security?Privacy_Accessibility",
                chinese ? @"辅助功能" : @"Accessibility", dragSteps, true);
        case 2:
            return openSystemSettings(@"com.apple.preference.security?Privacy_Microphone");
        case 3:
            if (@available(macOS 13.0, *)) return openSystemSettings(@"com.apple.Notifications-Settings.extension");
            return openSystemSettings(@"com.apple.preference.notifications");
        default:
            return false;
    }
}

extern "C" bool yonder_apple_open_resource_settings(int resource) {
    BOOL chinese = [NSLocale.preferredLanguages.firstObject hasPrefix:@"zh"];
    switch (resource) {
        case 0:
            return openPermissionGuide(@"com.apple.preference.security?Privacy_Calendars",
                chinese ? @"日历" : @"Calendars", chinese
                    ? @"在日历列表中找到 Yonder，将权限设为完全访问，再回到连接器重试。"
                       @"如果系统要求退出并重新打开 Yonder，请按提示操作。"
                    : @"Find Yonder in Calendars, set access to Full Access, then return and retry connecting. "
                       @"If macOS asks you to quit and reopen Yonder, follow that prompt.", false);
        case 1:
            return openPermissionGuide(@"com.apple.preference.security?Privacy_Photos",
                chinese ? @"照片" : @"Photos", chinese
                    ? @"在照片列表中找到 Yonder，允许访问照片，再回到连接器重试。"
                       @"如果系统要求退出并重新打开 Yonder，请按提示操作。"
                    : @"Find Yonder in Photos, allow photo access, then return and retry connecting. "
                       @"If macOS asks you to quit and reopen Yonder, follow that prompt.", false);
        case 2:
            return openPermissionGuide(@"com.apple.preference.security?Privacy_Automation",
                chinese ? @"自动化" : @"Automation", chinese
                    ? @"展开 Yonder，打开备忘录，再回到连接器重试。"
                    : @"Expand Yonder and turn on Notes, then return and retry connecting.", false);
        case 3:
            return yonder_mac_open_permissions(0);
        default:
            return false;
    }
}

extern "C" bool yonder_mac_accessibility_granted() {
    return AXIsProcessTrusted();
}

extern "C" void yonder_mac_request_accessibility() {
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}

extern "C" int yonder_mac_microphone_status() {
    switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
        case AVAuthorizationStatusNotDetermined: return 0;
        case AVAuthorizationStatusAuthorized: return 1;
        case AVAuthorizationStatusDenied:
        case AVAuthorizationStatusRestricted: return 2;
        default: return -1;
    }
}

extern "C" void yonder_mac_request_microphone(void *context, void (*complete)(void *, bool)) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio
        completionHandler:^(BOOL granted) { complete(context, granted); }];
}

extern "C" void yonder_mac_initialize_login_item() {
    if (@available(macOS 13.0, *)) {
        if (!isAppBundle()) return;
        NSUserDefaults *preferences = NSUserDefaults.standardUserDefaults;
        NSString *key = @"yonder.login-item-initialized";
        if ([preferences boolForKey:key]) return;
        // Try the default only once. If the person later disables it in System Settings,
        // registration must stay off until they explicitly enable it again.
        [preferences setBool:YES forKey:key];
        SMAppService *service = SMAppService.mainAppService;
        if (service.status == SMAppServiceStatusNotRegistered) {
            [service registerAndReturnError:nil];
        }
    }
}

extern "C" int yonder_mac_login_item_status() {
    if (@available(macOS 13.0, *)) {
        if (isAppBundle()) return (int)SMAppService.mainAppService.status;
    }
    return -1;
}

extern "C" bool yonder_mac_set_login_item(bool enabled) {
    if (@available(macOS 13.0, *)) {
        if (!isAppBundle()) return false;
        SMAppService *service = SMAppService.mainAppService;
        if (enabled && service.status == SMAppServiceStatusRequiresApproval) {
            [SMAppService openSystemSettingsLoginItems];
            return true;
        }
        if (enabled && service.status != SMAppServiceStatusEnabled) {
            return [service registerAndReturnError:nil];
        }
        if (!enabled && (service.status == SMAppServiceStatusEnabled ||
            service.status == SMAppServiceStatusRequiresApproval)) {
            return [service unregisterAndReturnError:nil];
        }
        return true;
    }
    return false;
}
