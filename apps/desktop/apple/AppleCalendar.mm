#import "AppleResourceBridge.h"
#import <EventKit/EventKit.h>

#if TARGET_OS_IOS
#import <UIKit/UIKit.h>

extern "C" void yonder_ios_open_apple_resource_settings(void *context, YonderApplePermissionReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSURL *url = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
        if (url == nil) {
            reply(context, 0);
            return;
        }
        [UIApplication.sharedApplication openURL:url options:@{} completionHandler:^(BOOL opened) {
            reply(context, opened ? 1 : 0);
        }];
    });
}
#endif

extern "C" int32_t yonder_apple_calendar_status(void) {
    switch ([EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent]) {
        case EKAuthorizationStatusNotDetermined: return AppleUndetermined;
        case EKAuthorizationStatusRestricted: return AppleRestricted;
        case EKAuthorizationStatusDenied: return AppleDenied;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        // The legacy Authorized value is identical to FullAccess.
        case EKAuthorizationStatusAuthorized: return AppleGranted;
#pragma clang diagnostic pop
        case EKAuthorizationStatusWriteOnly: return AppleUndetermined;
        default: return AppleUnsupported;
    }
}

extern "C" void yonder_apple_calendar_request(void *context, YonderApplePermissionReply reply) {
    dispatch_async(dispatch_get_main_queue(), ^{
        int32_t status = yonder_apple_calendar_status();
        if (status != AppleUndetermined) {
            reply(context, status);
            return;
        }
        EKEventStore *store = [EKEventStore new];
        EKEventStoreRequestAccessCompletionHandler completion = ^(BOOL, NSError *) {
            // Keep the store alive until EventKit finishes requesting consent.
            (void)store;
            reply(context, yonder_apple_calendar_status());
        };
        if (@available(macOS 14.0, iOS 17.0, *)) {
            [store requestFullAccessToEventsWithCompletion:completion];
        } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
            [store requestAccessToEntityType:EKEntityTypeEvent completion:completion];
#pragma clang diagnostic pop
        }
    });
}

static NSString *eventId(EKEvent *event) {
    // EventKit's identifier can point to a whole recurring series. Preserve the occurrence start too.
    NSData *identity = [NSJSONSerialization dataWithJSONObject:@[
        event.eventIdentifier, @(event.startDate.timeIntervalSince1970),
    ] options:0 error:nil];
    return [identity base64EncodedStringWithOptions:0];
}

static NSDictionary *eventFields(EKEvent *event, NSISO8601DateFormatter *formatter, BOOL details) {
    if (event.eventIdentifier == nil || event.startDate == nil || event.endDate == nil) return nil;
    NSString *identifier = eventId(event);
    if (identifier == nil) return nil;
    NSMutableDictionary *record = [@{
        @"id": identifier,
        @"title": YonderText(event.title, 512),
        @"startsAt": [formatter stringFromDate:event.startDate],
        @"endsAt": [formatter stringFromDate:event.endDate],
        @"allDay": @(event.isAllDay),
        @"calendar": YonderText(event.calendar.title, 160),
    } mutableCopy];
    if (details) {
        if (event.notes.length) record[@"notes"] = YonderText(event.notes, 4000);
        if (event.location.length) record[@"location"] = YonderText(event.location, 512);
        if (event.URL != nil) record[@"url"] = YonderText(event.URL.absoluteString, 1024);
    }
    return record;
}

static EKEvent *findOccurrence(EKEventStore *store, NSString *opaqueId) {
    NSData *bytes = [[NSData alloc] initWithBase64EncodedString:opaqueId options:0];
    NSArray *identity = bytes == nil ? nil : [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
    if (![identity isKindOfClass:NSArray.class] || identity.count != 2 ||
        ![identity[0] isKindOfClass:NSString.class] || ![identity[1] isKindOfClass:NSNumber.class]) return nil;
    NSTimeInterval seconds = [identity[1] doubleValue];
    if (!isfinite(seconds) || fabs(seconds) > 32e9) return nil;
    NSDate *start = [NSDate dateWithTimeIntervalSince1970:seconds];
    EKEvent *first = [store eventWithIdentifier:identity[0]];
    if ([first.startDate isEqualToDate:start]) return first;
    NSPredicate *predicate = [store predicateForEventsWithStartDate:[start dateByAddingTimeInterval:-1]
        endDate:[start dateByAddingTimeInterval:1] calendars:nil];
    for (EKEvent *event in [store eventsMatchingPredicate:predicate]) {
        if ([event.eventIdentifier isEqual:identity[0]] && [event.startDate isEqualToDate:start]) return event;
    }
    return nil;
}

static void listEvents(EKEventStore *store, NSDictionary *args, NSISO8601DateFormatter *formatter,
                       void *context, YonderAppleReply reply) {
    NSDate *start = YonderParseDay(args[@"dateFrom"]);
    NSDate *last = YonderParseDay(args[@"dateTo"]);
    NSCalendar *calendar = YonderLocalCalendar();
    if (start == nil || last == nil || [start compare:last] == NSOrderedDescending ||
        [last compare:[calendar dateByAddingUnit:NSCalendarUnitDay value:30 toDate:start options:0]]
            == NSOrderedDescending) {
        reply(context, AppleInvalidInput, nullptr, 0);
        return;
    }
    NSDate *end = [calendar dateByAddingUnit:NSCalendarUnitDay value:1 toDate:last options:0];
    NSPredicate *predicate = [store predicateForEventsWithStartDate:start endDate:end calendars:nil];
    NSArray<EKEvent *> *events = [[store eventsMatchingPredicate:predicate]
        sortedArrayUsingSelector:@selector(compareStartDateWithEvent:)];
    NSString *query = args[@"query"];
    NSUInteger remaining = [args[@"offset"] unsignedIntegerValue];
    NSUInteger limit = YonderListLimit(args);
    NSMutableArray *results = [NSMutableArray arrayWithCapacity:limit + 1];
    for (EKEvent *event in events) {
        if (query.length && ![event.title localizedCaseInsensitiveContainsString:query] &&
            ![event.calendar.title localizedCaseInsensitiveContainsString:query]) continue;
        NSDictionary *record = eventFields(event, formatter, NO);
        if (record == nil) continue;
        if (remaining > 0) {
            remaining--;
            continue;
        }
        [results addObject:record];
        if (results.count > limit) break;
    }
    BOOL more = results.count > limit;
    if (more) [results removeLastObject];
    YonderReplyJSON(context, reply, @{@"kind": @"apple_calendar_list", @"events": results, @"more": @(more)});
}

extern "C" void yonder_apple_calendar_execute(bool read, const char *argsJSON,
                                               void *context, YonderAppleReply reply) {
    NSData *bytes = [NSData dataWithBytes:argsJSON length:strlen(argsJSON)];
    NSDictionary *args = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        if (yonder_apple_calendar_status() != AppleGranted) {
            reply(context, ApplePermissionDenied, nullptr, 0);
            return;
        }
        EKEventStore *store = [EKEventStore new];
        NSISO8601DateFormatter *formatter = [NSISO8601DateFormatter new];
        if (!read) {
            listEvents(store, args, formatter, context, reply);
            return;
        }
        NSDictionary *record = eventFields(findOccurrence(store, args[@"id"]), formatter, YES);
        if (record == nil) {
            reply(context, AppleNotFound, nullptr, 0);
            return;
        }
        YonderReplyJSON(context, reply, @{@"kind": @"apple_calendar_read", @"event": record});
    });
}
