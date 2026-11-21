#pragma once
#import <Foundation/Foundation.h>

enum YonderApplePermission : int32_t {
    AppleUndetermined, AppleGranted, AppleLimited, AppleDenied, AppleRestricted, AppleUnsupported, AppleSourceUnavailable,
};
enum YonderAppleResult : int32_t {
    AppleOK, ApplePermissionDenied, AppleReadFailed, AppleNotFound, AppleInvalidInput, AppleUnavailable, AppleTooLarge,
};
typedef void (*YonderAppleReply)(void *, int32_t, const void *, size_t);
typedef void (*YonderApplePermissionReply)(void *, int32_t);

static inline void YonderReplyJSON(void *context, YonderAppleReply reply, NSDictionary *result) {
    NSData *bytes = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    reply(context, bytes == nil ? AppleReadFailed : AppleOK, bytes.bytes, bytes.length);
}

static inline NSString *YonderText(NSString *value, NSUInteger limit) {
    if (value == nil) return @"";
    if (value.length <= limit) return value;
    if (CFStringIsSurrogateHighCharacter([value characterAtIndex:limit - 1])) limit--;
    return [value substringToIndex:limit];
}

static inline NSCalendar *YonderLocalCalendar(void) {
    NSCalendar *calendar = [NSCalendar calendarWithIdentifier:NSCalendarIdentifierGregorian];
    calendar.timeZone = NSTimeZone.localTimeZone;
    return calendar;
}

static inline NSDate *YonderParseDay(id value) {
    if (![value isKindOfClass:NSString.class] || [value length] != 10) return nil;
    NSDateFormatter *formatter = [NSDateFormatter new];
    formatter.locale = [[NSLocale alloc] initWithLocaleIdentifier:@"en_US_POSIX"];
    formatter.calendar = YonderLocalCalendar();
    formatter.timeZone = NSTimeZone.localTimeZone;
    formatter.dateFormat = @"yyyy-MM-dd";
    NSDate *date = [formatter dateFromString:value];
    return date != nil && [[formatter stringFromDate:date] isEqualToString:value] ? date : nil;
}

static inline NSUInteger YonderListLimit(NSDictionary *args) {
    return args[@"limit"] == nil ? 20 : MIN([args[@"limit"] unsignedIntegerValue], (NSUInteger)50);
}
