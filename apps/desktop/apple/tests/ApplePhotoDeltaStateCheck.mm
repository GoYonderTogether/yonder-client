#import "../ApplePhotoDeltaState.h"
#include <cassert>

int main() {
    @autoreleasepool {
        NSString *ownerOneDeviceOne = [@"a" stringByPaddingToLength:64 withString:@"a" startingAtIndex:0];
        NSString *ownerOneDeviceTwo = [@"b" stringByPaddingToLength:64 withString:@"b" startingAtIndex:0];
        NSString *ownerTwoDeviceOne = [@"c" stringByPaddingToLength:64 withString:@"c" startingAtIndex:0];
        NSString *nextGrantRevision = [@"d" stringByPaddingToLength:64 withString:@"d" startingAtIndex:0];
        NSData *priorToken = [@"cursor-1" dataUsingEncoding:NSUTF8StringEncoding];
        NSData *nextToken = [@"cursor-2" dataUsingEncoding:NSUTF8StringEncoding];
        NSDictionary *prior = YonderPhotoDeltaCheckpoint(ownerOneDeviceOne, 1, priorToken,
            @{@"removed": @[@11, @11], @"updated": @[@12, @12]});
        assert(YonderPhotoDeltaCurrent(prior, ownerOneDeviceOne, 1) == prior);
        assert(YonderPhotoDeltaCurrent(prior, ownerOneDeviceTwo, 1) == nil);
        assert(YonderPhotoDeltaCurrent(prior, ownerTwoDeviceOne, 1) == nil);
        assert(YonderPhotoDeltaCurrent(prior, nextGrantRevision, 1) == nil);
        assert(YonderPhotoDeltaCurrent(prior, ownerOneDeviceOne, 2) == nil);
        assert(YonderPhotoDeltaCurrent(prior, ownerOneDeviceOne, 3) == nil);

        // The caller must not commit a staged token without a complete visibility projection.
        assert(YonderPhotoDeltaCheckpoint(ownerOneDeviceOne, 1, nextToken, nil) == nil);
        assert([prior[@"token"] isEqual:priorToken]);
        assert([prior[@"refs"] count] == 2);
        NSDictionary *next = YonderPhotoDeltaCheckpoint(ownerOneDeviceOne, 1, nextToken,
            @{@"inserted": @[@13, @13], @"updated": @[@12, @14]});
        assert([next[@"token"] isEqual:nextToken]);
        assert(next[@"refs"][@"removed"] == nil);
        assert(([next[@"refs"][@"updated"] isEqual:@[@12, @14]]));

        // An expired cursor takes a new visible snapshot. Lack of visibility is not a delete record.
        NSDictionary *limited = YonderPhotoDeltaCheckpoint(ownerOneDeviceOne, 2, nextToken,
            @{@"selected": @[@15, @15]});
        assert(limited[@"refs"][@"inserted"] == nil && [limited[@"refs"] count] == 1);
        assert(YonderPhotoDeltaCurrent(limited, ownerOneDeviceOne, 2) == limited);

        NSMutableDictionary<NSString *, NSArray<NSNumber *> *> *all = [NSMutableDictionary dictionary];
        for (NSUInteger i = 0; i < 300; ++i)
            all[[NSString stringWithFormat:@"photo-%lu", (unsigned long)i]] = @[@(i), @(i)];
        NSDictionary *bounded = YonderPhotoDeltaCheckpoint(ownerOneDeviceOne, 1, nextToken, all);
        assert([bounded[@"refs"] count] == 256);
        assert(bounded[@"refs"][@"photo-0"] == nil && bounded[@"refs"][@"photo-299"] != nil);
    }
}
