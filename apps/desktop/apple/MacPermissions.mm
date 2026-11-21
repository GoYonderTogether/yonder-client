#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <AVFoundation/AVFoundation.h>
#import <ServiceManagement/ServiceManagement.h>

namespace {
bool openSystemSettings(NSString *pane) {
    return [NSWorkspace.sharedWorkspace openURL:
        [NSURL URLWithString:[@"x-apple.systempreferences:" stringByAppendingString:pane]]];
}

BOOL isAppBundle() {
    return [NSBundle.mainBundle.bundleURL.pathExtension isEqualToString:@"app"];
}
}

extern "C" bool yonder_mac_open_permissions(int permission) {
    switch (permission) {
        case 0:
            return openSystemSettings(@"com.apple.preference.security?Privacy_AllFiles");
        case 1:
            return openSystemSettings(@"com.apple.preference.security?Privacy_Accessibility");
        case 2:
            return openSystemSettings(@"com.apple.preference.security?Privacy_Microphone");
        case 3:
            if (@available(macOS 13.0, *)) return openSystemSettings(@"com.apple.Notifications-Settings.extension");
            return openSystemSettings(@"com.apple.preference.notifications");
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
