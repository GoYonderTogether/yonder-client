#import <Foundation/Foundation.h>
#import <TargetConditionals.h>

#if TARGET_OS_IOS
#import <UIKit/UIKit.h>
#else
#import <SystemConfiguration/SystemConfiguration.h>
#endif

extern "C" void yonder_apple_device_name(void *context, void (*reply)(void *, const char *)) {
    @autoreleasepool {
#if TARGET_OS_IOS
        NSString *name = UIDevice.currentDevice.name;
#else
        NSString *name = CFBridgingRelease(SCDynamicStoreCopyComputerName(nullptr, nullptr));
        if (name.length == 0) name = CFBridgingRelease(SCDynamicStoreCopyLocalHostName(nullptr));
#endif
        reply(context, name.UTF8String);
    }
}
