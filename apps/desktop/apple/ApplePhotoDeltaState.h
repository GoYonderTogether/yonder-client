#pragma once
#import <Foundation/Foundation.h>

static constexpr NSUInteger YonderPhotoRefLimit = 256;

// The cursor never crosses a connection revision or a system permission boundary.
static inline NSDictionary *YonderPhotoDeltaCurrent(NSDictionary *saved, NSString *scope, NSInteger permission) {
    return [saved[@"scope"] isEqual:scope] && [saved[@"permission"] isEqual:@(permission)] &&
        [saved[@"token"] isKindOfClass:NSData.class] && [saved[@"refs"] isKindOfClass:NSDictionary.class] &&
        [saved[@"refs"] count] <= YonderPhotoRefLimit ? saved : nil;
}

// EXPIRED/UNAVAILABLE must use an actual visible baseline and its token, not old merged results.
static inline NSDictionary *YonderPhotoDeltaCheckpoint(NSString *scope, NSInteger permission,
        NSData *token, NSDictionary<NSString *, NSArray<NSNumber *> *> *visibleRefs) {
    if (scope.length != 64 || !token.length || token.length > 65536 || visibleRefs == nil) return nil;
    NSMutableArray<NSString *> *ids = [NSMutableArray array];
    for (NSString *key in visibleRefs) {
        if (key.length && key.length <= 512) [ids addObject:key];
    }
    [ids sortUsingComparator:^NSComparisonResult(NSString *a, NSString *b) {
        NSComparisonResult date = [visibleRefs[b].firstObject compare:visibleRefs[a].firstObject];
        return date == NSOrderedSame ? [a compare:b options:NSLiteralSearch] : date;
    }];
    NSMutableDictionary *refs = [NSMutableDictionary dictionaryWithCapacity:MIN(YonderPhotoRefLimit, ids.count)];
    for (NSUInteger i = 0; i < MIN(YonderPhotoRefLimit, ids.count); i++) refs[ids[i]] = visibleRefs[ids[i]];
    return @{@"scope": scope, @"permission": @(permission), @"token": token, @"refs": refs};
}
