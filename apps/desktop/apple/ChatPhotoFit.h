#pragma once

#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static BOOL isResizableStillType(NSString *type) {
    return [type isEqualToString:UTTypeJPEG.identifier] || [type isEqualToString:UTTypeHEIC.identifier];
}

// ImageIO downsamples from disk; never decode the whole oversized original into a UIImage.
static BOOL fitStillPhoto(NSURL *input, NSURL *output, NSUInteger maxOutputBytes) {
    CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)input,
        (__bridge CFDictionaryRef)@{ (__bridge NSString *)kCGImageSourceShouldCache: @NO });
    if (!source) return NO;
    BOOL still = CGImageSourceGetCount(source) == 1 &&
        isResizableStillType((__bridge NSString *)CGImageSourceGetType(source));
    NSDictionary *properties = still ? CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, nullptr)) : nil;
    double width = [properties[(__bridge NSString *)kCGImagePropertyPixelWidth] doubleValue];
    double height = [properties[(__bridge NSString *)kCGImagePropertyPixelHeight] doubleValue];
    CGImageRef image = width > 0 && height > 0 && width * height <= 100000000
        ? CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)@{
            (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
            (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform: @YES,
            (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize: @2048,
        }) : nullptr;
    CFRelease(source);
    if (!image) return NO;
    CGImageAlphaInfo alpha = CGImageGetAlphaInfo(image);
    BOOL opaque = alpha == kCGImageAlphaNone || alpha == kCGImageAlphaNoneSkipFirst || alpha == kCGImageAlphaNoneSkipLast;
    CGImageDestinationRef target = opaque ? CGImageDestinationCreateWithURL((__bridge CFURLRef)output,
        (__bridge CFStringRef)UTTypeJPEG.identifier, 1, nullptr) : nullptr;
    BOOL encoded = NO;
    if (target) {
        CGImageDestinationAddImage(target, image, (__bridge CFDictionaryRef)@{
            (__bridge NSString *)kCGImageDestinationLossyCompressionQuality: @0.86,
        });
        encoded = CGImageDestinationFinalize(target);
        CFRelease(target);
    }
    CGImageRelease(image);
    NSNumber *size = nil;
    [output getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
    return encoded && size.unsignedLongLongValue > 0 && size.unsignedLongLongValue <= maxOutputBytes;
}
