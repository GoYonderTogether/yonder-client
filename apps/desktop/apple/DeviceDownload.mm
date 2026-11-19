#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

extern "C" bool yonder_ios_share_download(void *webview, const char *url) {
    WKWebView *view = (__bridge WKWebView *)webview;
    UIViewController *presenter = view.window.rootViewController;
    while (presenter.presentedViewController != nil) {
        presenter = presenter.presentedViewController;
    }
    NSURL *link = [NSURL URLWithString:[NSString stringWithUTF8String:url]];
    if (link == nil || presenter.viewIfLoaded.window == nil ||
        [presenter isKindOfClass:UIActivityViewController.class]) {
        return false;
    }

    UIActivityViewController *sheet =
        [[UIActivityViewController alloc] initWithActivityItems:@[link] applicationActivities:nil];
    sheet.popoverPresentationController.sourceView = view;
    sheet.popoverPresentationController.sourceRect =
        CGRectMake(CGRectGetMidX(view.bounds), CGRectGetMidY(view.bounds), 1, 1);
    [presenter presentViewController:sheet animated:YES completion:nil];
    return true;
}
