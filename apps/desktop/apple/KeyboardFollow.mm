#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

// WKWebView reports the keyboard to the page only after it has finished moving, and reveals the
// focused field by scrolling the whole document. Both made the composer jump after the keyboard
// had already settled. This tells the page where the keyboard will end and how long it takes the
// moment it starts, so the page moves its bottom container in the same animation, and holds the
// document still while the keyboard is up so nothing else shifts.
@interface YonderKeyboardFollower : NSObject
@property(nonatomic, weak) WKWebView *webView;
@property(nonatomic) BOOL pinned;
@end

@implementation YonderKeyboardFollower

- (instancetype)initWithWebView:(WKWebView *)webView {
    if ((self = [super init])) {
        _webView = webView;
        [NSNotificationCenter.defaultCenter addObserver:self
                                               selector:@selector(keyboardWillChange:)
                                                   name:UIKeyboardWillChangeFrameNotification
                                                 object:nil];
        [webView.scrollView addObserver:self forKeyPath:@"contentOffset" options:0 context:nil];
    }
    return self;
}

- (void)keyboardWillChange:(NSNotification *)notification {
    WKWebView *view = self.webView;
    UIScreen *screen = view.window.windowScene.screen;
    if (view == nil || screen == nil) return;
    CGRect end = [notification.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
    // A hardware keyboard's shortcut bar and a dismissal both end at or below the bottom edge.
    CGRect keyboard = [view convertRect:end fromCoordinateSpace:screen.coordinateSpace];
    CGFloat overlap = CGRectIsEmpty(end) ? 0 : MAX(0, CGRectGetMaxY(view.bounds) - CGRectGetMinY(keyboard));
    double duration = [notification.userInfo[UIKeyboardAnimationDurationUserInfoKey] doubleValue];
    BOOL wasPinned = self.pinned;
    if (overlap == 0) self.pinned = NO;
    // Only a page that takes over keyboard avoidance (the app shell cancels the event) is held
    // still; sign-in and other plain pages keep WebKit's own scrolling to reach their fields.
    NSString *script = [NSString
        stringWithFormat:@"!window.dispatchEvent(new CustomEvent('yonder-keyboard',{cancelable:true,detail:{height:%.1f,duration:%.0f}}))",
                         overlap, duration * 1000];
    __weak YonderKeyboardFollower *weakSelf = self;
    [view evaluateJavaScript:script
           completionHandler:^(id handled, NSError *error) {
             YonderKeyboardFollower *strongSelf = weakSelf;
             if (strongSelf == nil || overlap == 0) return;
             strongSelf.pinned = [handled isKindOfClass:NSNumber.class] && [handled boolValue];
             if (strongSelf.pinned) [strongSelf holdStill];
           }];
    // WebKit can leave the document scrolled after the keyboard goes; settle it once it has.
    if (overlap == 0 && wasPinned)
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((duration + 0.05) * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{
                         [weakSelf holdStill];
                       });
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context {
    if (self.pinned) [self holdStill];
}

- (void)holdStill {
    UIScrollView *scroll = self.webView.scrollView;
    CGPoint rest = CGPointMake(-scroll.adjustedContentInset.left, -scroll.adjustedContentInset.top);
    if (!CGPointEqualToPoint(scroll.contentOffset, rest)) scroll.contentOffset = rest;
}

@end

static YonderKeyboardFollower *follower;

extern "C" void yonder_ios_follow_keyboard(void *webview) {
    if (follower != nil) return;
    follower = [[YonderKeyboardFollower alloc] initWithWebView:(__bridge WKWebView *)webview];
}
