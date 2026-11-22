#import <AVFoundation/AVFoundation.h>

extern "C" void yonder_ios_prepare_chat_microphone(void *context, void (*complete)(void *)) {
    void (^respond)(BOOL) = ^(BOOL granted) {
        (void)granted;
        complete(context);
    };
    if (@available(iOS 17.0, *)) {
        [AVAudioApplication requestRecordPermissionWithCompletionHandler:respond];
    } else {
        [AVAudioSession.sharedInstance requestRecordPermission:respond];
    }
}
