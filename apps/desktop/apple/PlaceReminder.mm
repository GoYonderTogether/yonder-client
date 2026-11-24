#import <CoreLocation/CoreLocation.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#include <cmath>

typedef void (*PlaceReply)(void *, int32_t);
static NSString *const Identifier = @"yonder.local.place-reminder";
static const CLLocationDistance Radius = 200;
static bool adding = false;
static bool cancelled = false;
static unsigned authorizationEpoch = 0;

static bool authorized(CLAuthorizationStatus status) {
    return status == kCLAuthorizationStatusAuthorizedWhenInUse || status == kCLAuthorizationStatusAuthorizedAlways;
}

@interface YonderPlaceAuthorization : NSObject <CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *manager;
@property(nonatomic, copy) void (^finish)(int32_t);
@end

static YonderPlaceAuthorization *pendingAuthorization;

@implementation YonderPlaceAuthorization
- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
    CLAuthorizationStatus status = manager.authorizationStatus;
    if (status == kCLAuthorizationStatusNotDetermined || !self.finish) return;
    void (^reply)(int32_t) = self.finish;
    self.finish = nil;
    manager.delegate = nil;
    pendingAuthorization = nil;
    reply(authorized(status) ? 0 : 1);
}
@end

static void requestLocationPermission(void *context, PlaceReply reply) {
    if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive || pendingAuthorization) {
        reply(context, 4);
        return;
    }
    YonderPlaceAuthorization *pending = [YonderPlaceAuthorization new];
    pending.manager = [CLLocationManager new];
    CLAuthorizationStatus status = pending.manager.authorizationStatus;
    if (status != kCLAuthorizationStatusNotDetermined) {
        reply(context, authorized(status) ? 0 : 1);
        return;
    }
    pendingAuthorization = pending;
    pending.finish = ^(int32_t result) { reply(context, result); };
    pending.manager.delegate = pending;
    [pending.manager requestWhenInUseAuthorization];
}

// A fix is strictly local, one shot, and never prompts for additional accuracy.
typedef void (*LocationReply)(void *, int32_t, double, double, double, int64_t, bool);
static const NSTimeInterval FixTimeout = 12;
static const NSTimeInterval MaxFixAge = 10;

@interface YonderLocationRequest : NSObject <CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *manager;
@property(nonatomic, strong) id backgroundObserver;
@property(nonatomic, assign) void *context;
@property(nonatomic, assign) LocationReply reply;
@property(nonatomic, assign) CLAccuracyAuthorization accuracyMode;
- (void)finish:(int32_t)status location:(CLLocation *)location;
@end

static YonderLocationRequest *pendingFix;

@implementation YonderLocationRequest
- (void)finish:(int32_t)status location:(CLLocation *)location {
    if (pendingFix != self) return;
    CLLocationManager *manager = self.manager;
    if (status == 0) {
        if (!authorized(manager.authorizationStatus)) status = 1;
        else if (manager.accuracyAuthorization != self.accuracyMode) status = 4;
        else if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) status = 4;
    }
    manager.delegate = nil;
    [manager stopUpdatingLocation]; // also cancels an outstanding requestLocation
    [NSNotificationCenter.defaultCenter removeObserver:self.backgroundObserver];
    self.backgroundObserver = nil;
    LocationReply callback = self.reply;
    void *context = self.context;
    bool approximate = self.accuracyMode == CLAccuracyAuthorizationReducedAccuracy;
    pendingFix = nil;
    if (status) {
        callback(context, status, 0, 0, 0, 0, false);
        return;
    }
    callback(context, 0, location.coordinate.latitude, location.coordinate.longitude, location.horizontalAccuracy,
        static_cast<int64_t>(location.timestamp.timeIntervalSince1970 * 1000),
        approximate);
}

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
    // Use the newest fresh, usable fix. Never substitute the current clock for the OS timestamp.
    for (CLLocation *location in locations.reverseObjectEnumerator) {
        NSTimeInterval age = -location.timestamp.timeIntervalSinceNow;
        double timestamp = location.timestamp.timeIntervalSince1970;
        double accuracy = location.horizontalAccuracy;
        if (CLLocationCoordinate2DIsValid(location.coordinate) && std::isfinite(accuracy) && accuracy >= 0 &&
            std::isfinite(timestamp) && timestamp > 0 && timestamp <= 8.64e12 && age >= 0 && age <= MaxFixAge) {
            [self finish:0 location:location];
            return;
        }
    }
    [self finish:5 location:nil];
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
    [self finish:(!authorized(manager.authorizationStatus) || error.code == kCLErrorDenied) ? 1 : 5 location:nil];
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
    if (!authorized(manager.authorizationStatus)) [self finish:1 location:nil];
}
@end

extern "C" void yonder_ios_prepare_location(void *context, PlaceReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{ requestLocationPermission(context, reply); });
}

extern "C" void yonder_ios_current_location(void *context, LocationReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive || pendingFix) {
            reply(context, 4, 0, 0, 0, 0, false);
            return;
        }
        CLLocationManager *manager = [CLLocationManager new];
        if (!authorized(manager.authorizationStatus)) {
            reply(context, 1, 0, 0, 0, 0, false);
            return;
        }
        YonderLocationRequest *request = [YonderLocationRequest new];
        request.context = context;
        request.reply = reply;
        request.manager = manager;
        request.accuracyMode = manager.accuracyAuthorization;
        pendingFix = request;
        __weak YonderLocationRequest *weakRequest = request;
        request.backgroundObserver = [NSNotificationCenter.defaultCenter
            addObserverForName:UIApplicationDidEnterBackgroundNotification object:nil queue:NSOperationQueue.mainQueue
            usingBlock:^(NSNotification *notification) { [weakRequest finish:4 location:nil]; }];
        manager.desiredAccuracy = request.accuracyMode == CLAccuracyAuthorizationReducedAccuracy
            ? kCLLocationAccuracyReduced : kCLLocationAccuracyBest;
        manager.delegate = request;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, FixTimeout * NSEC_PER_SEC), dispatch_get_main_queue(),
            ^{ [weakRequest finish:6 location:nil]; });
        [manager requestLocation];
    });
}

extern "C" void yonder_ios_prepare_place_reminder(void *context, PlaceReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) {
            reply(context, 4);
            return;
        }
        unsigned epoch = ++authorizationEpoch;
        UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
        [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
            completionHandler:^(BOOL granted, NSError *error) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (epoch != authorizationEpoch) reply(context, 4);
                    else if (error || !granted) reply(context, 2);
                    else requestLocationPermission(context, reply);
                });
            }];
    });
}

static bool isPlaceRequest(UNNotificationRequest *request) {
    return [request.identifier isEqualToString:Identifier] &&
           [request.trigger isKindOfClass:UNLocationNotificationTrigger.class];
}

extern "C" bool yonder_ios_is_place_notification(UNNotificationRequest *request) {
    return isPlaceRequest(request);
}

static void removePlaceReminder(UNUserNotificationCenter *center) {
    [center removePendingNotificationRequestsWithIdentifiers:@[Identifier]];
    [center removeDeliveredNotificationsWithIdentifiers:@[Identifier]];
}

extern "C" void yonder_ios_schedule_place_reminder(double latitude, double longitude, bool chinese, void *context,
                                                     PlaceReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{
        CLLocationCoordinate2D coordinate = CLLocationCoordinate2DMake(latitude, longitude);
        if (!std::isfinite(latitude) || !std::isfinite(longitude) || !CLLocationCoordinate2DIsValid(coordinate)) {
            reply(context, 3);
            return;
        }
        if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive || adding) {
            reply(context, 4);
            return;
        }
        adding = true;
        cancelled = false;
        UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
        [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (cancelled || UIApplication.sharedApplication.applicationState != UIApplicationStateActive) {
                    adding = false;
                    reply(context, 4);
                    return;
                }
                if (settings.authorizationStatus != UNAuthorizationStatusAuthorized) {
                    adding = false;
                    reply(context, 2);
                    return;
                }
                CLLocationManager *manager = [CLLocationManager new];
                if (!authorized(manager.authorizationStatus) ||
                    ![CLLocationManager isMonitoringAvailableForClass:CLCircularRegion.class]) {
                    adding = false;
                    reply(context, 1);
                    return;
                }
                CLCircularRegion *region = [[CLCircularRegion alloc] initWithCenter:coordinate radius:Radius identifier:Identifier];
                region.notifyOnEntry = YES;
                region.notifyOnExit = NO;
                UNMutableNotificationContent *content = [UNMutableNotificationContent new];
                content.title = @"Yonder";
                content.body = chinese ? @"你已到达设置提醒的地点。" : @"You’ve reached your reminder location.";
                content.sound = UNNotificationSound.defaultSound;
                UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:Identifier content:content
                    trigger:[UNLocationNotificationTrigger triggerWithRegion:region repeats:NO]];
                [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
                    dispatch_async(dispatch_get_main_queue(), ^{
                        if (cancelled) removePlaceReminder(UNUserNotificationCenter.currentNotificationCenter);
                        adding = false;
                        reply(context, cancelled ? 4 : error ? 5 : 0);
                    });
                }];
            });
        }];
    });
}

extern "C" void yonder_ios_place_reminder_pending(void *context, PlaceReply reply) {
    [UNUserNotificationCenter.currentNotificationCenter getPendingNotificationRequestsWithCompletionHandler:
        ^(NSArray<UNNotificationRequest *> *requests) {
            for (UNNotificationRequest *request in requests) {
                if (isPlaceRequest(request)) {
                    reply(context, 1);
                    return;
                }
            }
            reply(context, 0);
        }];
}

extern "C" void yonder_ios_cancel_place_reminder(void *context, PlaceReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{
        cancelled = true;
        authorizationEpoch++;
        removePlaceReminder(UNUserNotificationCenter.currentNotificationCenter);
        reply(context, 0);
    });
}
