#import <TargetConditionals.h>
#import <UserNotifications/UserNotifications.h>

#if TARGET_OS_IOS
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

extern "C" bool yonder_ios_is_place_notification(UNNotificationRequest *request);
extern "C" void yonder_ios_notification_open(const char *payload);
extern "C" void yonder_ios_notification_token(const char *token, bool sandbox);

extern "C" void yonder_ios_open_notification_settings(void *context, void (*callback)(void *, bool)) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *url = UIApplicationOpenSettingsURLString;
        if (@available(iOS 15.4, *)) url = UIApplicationOpenNotificationSettingsURLString;
        [UIApplication.sharedApplication openURL:[NSURL URLWithString:url]
                                          options:@{}
                                completionHandler:^(BOOL opened) { callback(context, opened); }];
    });
}

@interface YonderNotificationDelegate : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation YonderNotificationDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completion {
    if (yonder_ios_is_place_notification(notification.request)) {
        completion(static_cast<UNNotificationPresentationOptions>(
            UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound));
        return;
    }
    // The app updates messages and unread counts without showing a foreground reminder.
    completion(static_cast<UNNotificationPresentationOptions>(0));
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
 didReceiveNotificationResponse:(UNNotificationResponse *)response
          withCompletionHandler:(void (^)(void))completion {
    // A local place reminder only opens Yonder through the system's default action.
    if (!yonder_ios_is_place_notification(response.notification.request) &&
        [response.actionIdentifier isEqualToString:UNNotificationDefaultActionIdentifier]) {
        NSDictionary *info = response.notification.request.content.userInfo;
        NSArray<NSString *> *keys = @[ @"notificationId", @"conversationId", @"messageId", @"recipientMemberId" ];
        NSMutableDictionary *target = [NSMutableDictionary dictionary];
        for (NSString *key in keys) {
            NSString *part = info[key];
            if (![part isKindOfClass:NSString.class] || part.length == 0) break;
            target[key] = part;
        }
        if (target.count == keys.count) {
            NSData *json = [NSJSONSerialization dataWithJSONObject:target options:0 error:nullptr];
            NSString *serialized = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
            if (serialized.UTF8String) yonder_ios_notification_open(serialized.UTF8String);
        }
    }
    completion();
}

@end

static void didRegister(id self, SEL, UIApplication *application, NSData *deviceToken) {
    NSMutableString *hex = [NSMutableString stringWithCapacity:deviceToken.length * 2];
    const uint8_t *bytes = static_cast<const uint8_t *>(deviceToken.bytes);
    for (NSUInteger index = 0; index < deviceToken.length; index++) {
        [hex appendFormat:@"%02x", bytes[index]];
    }
    NSString *environment = [NSBundle.mainBundle objectForInfoDictionaryKey:@"YonderPushEnvironment"];
    yonder_ios_notification_token(hex.UTF8String, [environment isEqualToString:@"sandbox"]);
}

static void didFailToRegister(id self, SEL, UIApplication *application, NSError *error) {
    // Registration is retried at next application activation or when the user enables permission.
    NSLog(@"Yonder APNs registration unavailable (%ld)", (long)error.code);
}

extern "C" void yonder_ios_install_notifications() {
    static YonderNotificationDelegate *delegate = [YonderNotificationDelegate new];
    UNUserNotificationCenter.currentNotificationCenter.delegate = delegate;

    // Tao builds its UIApplicationDelegate dynamically before calling UIApplicationMain.
    // Add only the two system callbacks that Tao does not implement.
    Class taoDelegate = NSClassFromString(@"AppDelegate");
    if (taoDelegate) {
        class_addMethod(taoDelegate, @selector(application:didRegisterForRemoteNotificationsWithDeviceToken:),
                        reinterpret_cast<IMP>(didRegister), "v@:@@");
        class_addMethod(taoDelegate, @selector(application:didFailToRegisterForRemoteNotificationsWithError:),
                        reinterpret_cast<IMP>(didFailToRegister), "v@:@@");
    }
}
#endif

API_AVAILABLE(macos(10.14))
static void notificationPermission(bool request, void *context, void (*callback)(void *, int32_t)) {
    UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
    void (^complete)(int32_t) = ^(int32_t status) {
        dispatch_async(dispatch_get_main_queue(), ^{
#if TARGET_OS_IOS
            if (status == 2 && [NSBundle.mainBundle objectForInfoDictionaryKey:@"YonderPushEnvironment"]) {
                [UIApplication.sharedApplication registerForRemoteNotifications];
            }
#endif
            callback(context, status);
        });
    };
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
        if (settings.authorizationStatus == UNAuthorizationStatusNotDetermined) {
            if (request) {
                [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound |
                                                          UNAuthorizationOptionBadge)
                                      completionHandler:^(BOOL granted, NSError *error) {
                    complete(granted ? 2 : 1);
                }];
            } else {
                complete(0);
            }
        } else {
            complete(settings.authorizationStatus == UNAuthorizationStatusDenied ? 1 : 2);
        }
    }];
}

extern "C" void yonder_apple_notification_permission(bool request, void *context,
                                                     void (*callback)(void *, int32_t)) {
    if (@available(macOS 10.14, *)) {
        notificationPermission(request, context, callback);
    } else {
        callback(context, 1);
    }
}
