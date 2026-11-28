// Desktop control's macOS native layer (desktop control design, 2026-11-28).
//
// The Rust side (src/desktop_macos.rs) owns validation and the delivery policy; this file is only
// the platform calls, behind a small C ABI that passes JSON in and out. Every string returned here
// is a malloc'd copy the Rust side frees with `yonder_desktop_free`.
//
// Read and act go through the Accessibility API (AXUIElement): the tree is walked to a bounded
// depth, each node given a ref ("n0", "n1", …) cached for the rest of the run so `desktop_input`
// can name it, and a node is acted on with AXUIElementPerformAction — never a synthesized mouse
// event, so the cursor and focus stay put. Screenshots use CGWindowListCreateImage (only the target
// window by default) and carry pixel dimensions so a model can map them back through the backing
// scale. Synthesized input defaults to CGEventPostToPid (background); foreground is CGEventPost.

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#include <cstdlib>
#include <cstring>
#include <dlfcn.h>
#include <map>
#include <string>
#include <vector>

// ApplicationServices (AX*, CGEvent*, CGWindow*) and AppKit give us the input and window APIs.
// `CoreGraphics` symbols come in through ApplicationServices; ImageIO/UTType give PNG encoding.

// ---------------------------------------------------------------------------------------------
// Shared state: refs cached across one read, and each window's pid/origin for coordinate maths.
// ---------------------------------------------------------------------------------------------
namespace {
std::vector<AXUIElementRef> gRefs;
std::map<std::string, pid_t> gWindowPid;
std::map<std::string, CGRect> gWindowBounds;

char *copyString(const std::string &text) {
    char *out = static_cast<char *>(malloc(text.size() + 1));
    if (!out) return nullptr;
    memcpy(out, text.c_str(), text.size());
    out[text.size()] = '\0';
    return out;
}

std::string jsonEscape(const std::string &raw) {
    std::string out;
    out.reserve(raw.size() + 8);
    for (unsigned char c : raw) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out;
}

std::string nsToUtf8(NSString *value) {
    if (!value) return "";
    const char *utf8 = value.UTF8String;
    return utf8 ? std::string(utf8) : "";
}

// The string value of a CF attribute, or "" when it is not a CFString.
std::string cfString(CFTypeRef value) {
    if (value && CFGetTypeID(value) == CFStringGetTypeID()) {
        return nsToUtf8((__bridge NSString *)value);
    }
    return "";
}

void resetRefs() {
    for (AXUIElementRef element : gRefs) {
        if (element) CFRelease(element);
    }
    gRefs.clear();
}

// Read the window's on-screen rect from its AX position/size attributes.
bool axBounds(AXUIElementRef element, CGRect *out) {
    CFTypeRef position = nullptr;
    CFTypeRef size = nullptr;
    if (AXUIElementCopyAttributeValue(element, kAXPositionAttribute, &position) != kAXErrorSuccess || !position) return false;
    if (AXUIElementCopyAttributeValue(element, kAXSizeAttribute, &size) != kAXErrorSuccess || !size) {
        CFRelease(position);
        return false;
    }
    CGPoint point = CGPointZero;
    CGSize dimensions = CGSizeZero;
    bool ok = AXValueGetValue((AXValueRef)position, (AXValueType)kAXValueCGPointType, &point) &&
              AXValueGetValue((AXValueRef)size, (AXValueType)kAXValueCGSizeType, &dimensions);
    CFRelease(position);
    CFRelease(size);
    if (!ok) return false;
    *out = CGRectMake(point.x, point.y, dimensions.width, dimensions.height);
    return true;
}

// All windows of one app element, as a CFArray of AXUIElement (caller releases the array).
CFArrayRef appWindows(AXUIElementRef app) {
    CFTypeRef windows = nullptr;
    if (AXUIElementCopyAttributeValue(app, kAXWindowsAttribute, &windows) != kAXErrorSuccess) return nullptr;
    return (CFArrayRef)windows;
}

// The AX window element for `windowId`, or nullptr. A window id is its CGWindow number (what
// `desktop_windows` reports); AX elements do not expose that number, so we match by the window's
// title against the CG window list, falling back to the first window (single-window apps).
AXUIElementRef windowElement(const std::string &windowId, pid_t pid) {
    AXUIElementRef app = AXUIElementCreateApplication(pid);
    if (!app) return nullptr;
    CFArrayRef windows = appWindows(app);
    if (!windows) {
        CFRelease(app);
        return nullptr;
    }
    // The CG title for this window id, used to pick the matching AX window.
    std::string wantedTitle;
    NSArray *info = CFBridgingRelease(CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
    for (NSDictionary *window in info) {
        if ([window[(id)kCGWindowNumber] intValue] == atoi(windowId.c_str())) {
            wantedTitle = nsToUtf8(window[(id)kCGWindowName] ?: @"");
            break;
        }
    }
    AXUIElementRef chosen = nullptr;
    CFIndex count = CFArrayGetCount(windows);
    for (CFIndex i = 0; i < count; i++) {
        AXUIElementRef window = (AXUIElementRef)CFArrayGetValueAtIndex(windows, i);
        CFTypeRef title = nullptr;
        bool match = false;
        if (!wantedTitle.empty() &&
            AXUIElementCopyAttributeValue(window, kAXTitleAttribute, &title) == kAXErrorSuccess && title) {
            match = (cfString(title) == wantedTitle);
            CFRelease(title);
        }
        if (match || (chosen == nullptr && (count == 1 || wantedTitle.empty()))) {
            chosen = (AXUIElementRef)CFRetain(window);
            if (match) break;
        }
    }
    CFRelease(windows);
    CFRelease(app);
    return chosen;
}

// Depth-first walk, appending JSON nodes; stops at `maxNodes`. Each node gets a ref into gRefs.
void walk(AXUIElementRef element, int depth, int maxDepth, int maxNodes, std::string &out, bool &truncated, int &count) {
    if (count >= maxNodes) {
        truncated = true;
        return;
    }
    std::string ref = "n" + std::to_string(gRefs.size());
    gRefs.push_back((AXUIElementRef)CFRetain(element));

    std::string role, title, value;
    CFTypeRef roleRef = nullptr;
    if (AXUIElementCopyAttributeValue(element, kAXRoleAttribute, &roleRef) == kAXErrorSuccess && roleRef) {
        role = cfString(roleRef);
        CFRelease(roleRef);
    }
    CFTypeRef titleRef = nullptr;
    if (AXUIElementCopyAttributeValue(element, kAXTitleAttribute, &titleRef) == kAXErrorSuccess && titleRef) {
        title = cfString(titleRef);
        CFRelease(titleRef);
    }
    CFTypeRef valueRef = nullptr;
    if (AXUIElementCopyAttributeValue(element, kAXValueAttribute, &valueRef) == kAXErrorSuccess && valueRef) {
        if (CFGetTypeID(valueRef) == CFStringGetTypeID()) value = cfString(valueRef);
        else if (CFGetTypeID(valueRef) == CFNumberGetTypeID()) {
            double number = 0;
            CFNumberGetValue((CFNumberRef)valueRef, kCFNumberDoubleType, &number);
            value = std::to_string(number);
        }
        CFRelease(valueRef);
    }

    out += "{\"ref\":\"" + jsonEscape(ref) + "\",\"role\":\"" + jsonEscape(role) + "\"";
    if (!title.empty()) out += ",\"title\":\"" + jsonEscape(title) + "\"";
    if (!value.empty()) out += ",\"value\":\"" + jsonEscape(value) + "\"";

    CGRect box = CGRectZero;
    if (axBounds(element, &box)) {
        out += ",\"bounds\":{\"x\":" + std::to_string(box.origin.x) + ",\"y\":" + std::to_string(box.origin.y) +
               ",\"width\":" + std::to_string(box.size.width) + ",\"height\":" + std::to_string(box.size.height) + "}";
    }

    CFArrayRef actions = nullptr;
    out += ",\"actions\":[";
    if (AXUIElementCopyActionNames(element, &actions) == kAXErrorSuccess && actions) {
        CFIndex actionCount = CFArrayGetCount(actions);
        for (CFIndex i = 0; i < actionCount; i++) {
            std::string name = cfString(CFArrayGetValueAtIndex(actions, i));
            if (i) out += ",";
            out += "\"" + jsonEscape(name) + "\"";
        }
        CFRelease(actions);
    }
    out += "]}";
    count++;

    if (depth >= maxDepth) return;
    CFTypeRef children = nullptr;
    if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &children) == kAXErrorSuccess && children) {
        if (CFGetTypeID(children) == CFArrayGetTypeID()) {
            CFArrayRef array = (CFArrayRef)children;
            CFIndex childCount = CFArrayGetCount(array);
            for (CFIndex i = 0; i < childCount && count < maxNodes; i++) {
                AXUIElementRef child = (AXUIElementRef)CFArrayGetValueAtIndex(array, i);
                out += ",";
                walk(child, depth + 1, maxDepth, maxNodes, out, truncated, count);
            }
        }
        CFRelease(children);
    }
}

// PNG bytes → base64 string.
std::string pngBase64(CGImageRef image) {
    NSMutableData *data = [NSMutableData data];
    CGImageDestinationRef destination =
        CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data, (__bridge CFStringRef)UTTypePNG.identifier, 1, nullptr);
    if (!destination) return "";
    CGImageDestinationAddImage(destination, image, nullptr);
    bool ok = CGImageDestinationFinalize(destination);
    CFRelease(destination);
    if (!ok) return "";
    return nsToUtf8([data base64EncodedStringWithOptions:0]);
}

// A virtual key code for a named key, or -1.
CGKeyCode keyCodeFor(const std::string &name) {
    NSString *lower = [NSString stringWithUTF8String:name.c_str()].lowercaseString;
    NSDictionary<NSString *, NSNumber *> *map = @{
        @"return": @36, @"enter": @36, @"tab": @48, @"space": @49, @"escape": @53, @"esc": @53,
        @"delete": @51, @"backspace": @51, @"forwarddelete": @117,
        @"up": @126, @"down": @125, @"left": @123, @"right": @124,
        @"home": @115, @"end": @119, @"pageup": @116, @"pagedown": @121,
        @"a": @0, @"s": @1, @"d": @2, @"f": @3, @"h": @4, @"g": @5, @"z": @6, @"x": @7, @"c": @8,
        @"v": @9, @"b": @11, @"q": @12, @"w": @13, @"e": @14, @"r": @15, @"y": @16, @"t": @17,
        @"1": @18, @"2": @19, @"3": @20, @"4": @21, @"6": @22, @"5": @23, @"9": @25, @"7": @26,
        @"8": @28, @"0": @29, @"o": @31, @"u": @32, @"i": @34, @"p": @35, @"l": @37, @"j": @38,
        @"k": @40, @"n": @45, @"m": @46,
    };
    NSNumber *code = map[lower];
    return code ? (CGKeyCode)code.unsignedShortValue : (CGKeyCode)-1;
}

// Build and post a keyboard event for a key/chord like "cmd+s" or "Return".
bool postKey(const std::string &key, pid_t pid, bool foreground) {
    uint64_t flags = 0;
    std::string rest = key;
    bool any = true;
    while (any) {
        any = false;
        if (rest.rfind("cmd+", 0) == 0) { flags |= kCGEventFlagMaskCommand; rest = rest.substr(4); any = true; }
        else if (rest.rfind("command+", 0) == 0) { flags |= kCGEventFlagMaskCommand; rest = rest.substr(8); any = true; }
        else if (rest.rfind("ctrl+", 0) == 0) { flags |= kCGEventFlagMaskControl; rest = rest.substr(5); any = true; }
        else if (rest.rfind("alt+", 0) == 0) { flags |= kCGEventFlagMaskAlternate; rest = rest.substr(4); any = true; }
        else if (rest.rfind("shift+", 0) == 0) { flags |= kCGEventFlagMaskShift; rest = rest.substr(6); any = true; }
    }
    CGKeyCode code = keyCodeFor(rest);
    if ((int)code < 0) return false;
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    CGEventRef down = CGEventCreateKeyboardEvent(source, code, true);
    CGEventRef up = CGEventCreateKeyboardEvent(source, code, false);
    if (flags && down) CGEventSetFlags(down, static_cast<CGEventFlags>(flags));
    if (flags && up) CGEventSetFlags(up, static_cast<CGEventFlags>(flags));
    if (down) { foreground ? CGEventPost(kCGHIDEventTap, down) : CGEventPostToPid(pid, down); CFRelease(down); }
    if (up) { foreground ? CGEventPost(kCGHIDEventTap, up) : CGEventPostToPid(pid, up); CFRelease(up); }
    if (source) CFRelease(source);
    return true;
}

// Type text as unicode keyboard events (UTF-16, which is what CGEventKeyboardSetUnicodeString takes).
void postText(NSString *text, pid_t pid, bool foreground) {
    if (text.length == 0) return;
    NSUInteger length = text.length;
    std::vector<UniChar> units(length);
    [text getCharacters:units.data() range:NSMakeRange(0, length)];
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    CGEventRef down = CGEventCreateKeyboardEvent(source, 0, true);
    if (down) {
        CGEventKeyboardSetUnicodeString(down, length, units.data());
        foreground ? CGEventPost(kCGHIDEventTap, down) : CGEventPostToPid(pid, down);
        CFRelease(down);
    }
    CGEventRef up = CGEventCreateKeyboardEvent(source, 0, false);
    if (up) {
        CGEventKeyboardSetUnicodeString(up, length, units.data());
        foreground ? CGEventPost(kCGHIDEventTap, up) : CGEventPostToPid(pid, up);
        CFRelease(up);
    }
    if (source) CFRelease(source);
}

CGEventRef mouseEvent(CGEventType type, CGPoint point, CGMouseButton button) {
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    CGEventRef event = CGEventCreateMouseEvent(source, type, point, button);
    if (source) CFRelease(source);
    return event;
}

void postMouse(CGEventRef event, pid_t pid, bool foreground) {
    if (!event) return;
    foreground ? CGEventPost(kCGHIDEventTap, event) : CGEventPostToPid(pid, event);
    CFRelease(event);
}

// The focused element's string value for one app, or "" — used to tell whether typing changed
// anything (the one honest `changed` signal this layer can produce).
std::string focusedValue(pid_t pid) {
    AXUIElementRef app = AXUIElementCreateApplication(pid);
    if (!app) return "";
    CFTypeRef focused = nullptr;
    std::string value;
    if (AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute, &focused) == kAXErrorSuccess && focused) {
        CFTypeRef text = nullptr;
        if (AXUIElementCopyAttributeValue((AXUIElementRef)focused, kAXValueAttribute, &text) == kAXErrorSuccess && text) {
            value = cfString(text);
            CFRelease(text);
        }
        CFRelease(focused);
    }
    CFRelease(app);
    return value;
}
}  // namespace

extern "C" {

bool yonder_desktop_accessibility_trusted(void) { return AXIsProcessTrusted(); }

bool yonder_desktop_screen_capture_allowed(void) {
    // Never shows a prompt; the first real screenshot request is what triggers the system dialog,
    // so this only reports whether recorder access is already granted.
    if (@available(macOS 10.15, *)) {
        return CGPreflightScreenCaptureAccess();
    }
    return true;
}

// {"windows":[{"id","app","title","pid","bounds":{…},"focused"}]} — on-screen, normal layer windows.
// Also (re)builds the id → pid/bounds cache `desktop_read_ax`/`desktop_screenshot`/`desktop_input`
// rely on, so a command that never called `desktop_windows` still resolves a window id.
char *yonder_desktop_list_windows(void) {
    gWindowPid.clear();
    gWindowBounds.clear();
    NSArray *info = CFBridgingRelease(CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
    std::string out = "{\"windows\":[";
    bool first = true;
    pid_t frontPid = 0;
    NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
    if (front) frontPid = front.processIdentifier;
    for (NSDictionary *window in info) {
        NSNumber *layer = window[(id)kCGWindowLayer];
        if (layer && layer.intValue != 0) continue;
        NSNumber *number = window[(id)kCGWindowNumber];
        NSNumber *pid = window[(id)kCGWindowOwnerPID];
        if (!number || !pid) continue;
        NSString *app = window[(id)kCGWindowOwnerName] ?: @"";
        NSString *title = window[(id)kCGWindowName] ?: @"";
        NSDictionary *bounds = window[(id)kCGWindowBounds];
        double x = 0, y = 0, w = 0, h = 0;
        if (bounds) {
            x = [bounds[@"X"] doubleValue];
            y = [bounds[@"Y"] doubleValue];
            w = [bounds[@"Width"] doubleValue];
            h = [bounds[@"Height"] doubleValue];
        }
        std::string id = std::to_string(number.intValue);
        gWindowPid[id] = pid.intValue;
        gWindowBounds[id] = CGRectMake(x, y, w, h);
        if (!first) out += ",";
        first = false;
        out += "{\"id\":\"" + jsonEscape(id) + "\",\"app\":\"" + jsonEscape(nsToUtf8(app)) +
               "\",\"title\":\"" + jsonEscape(nsToUtf8(title)) + "\",\"pid\":" + std::to_string(pid.intValue) +
               ",\"bounds\":{\"x\":" + std::to_string(x) + ",\"y\":" + std::to_string(y) + ",\"width\":" +
               std::to_string(w) + ",\"height\":" + std::to_string(h) + "},\"focused\":" +
               ((int)pid.intValue == (int)frontPid ? "true" : "false") + "}";
    }
    out += "]}";
    return copyString(out);
}

char *yonder_desktop_read_ax(const char *window_id, unsigned depth, unsigned max_nodes) {
    resetRefs();
    std::string id = window_id ? window_id : "";
    // A command that never listed windows first still has to resolve its id: refresh the cache once.
    if (gWindowPid.find(id) == gWindowPid.end()) {
        char *discard = yonder_desktop_list_windows();
        free(discard);
    }
    auto found = gWindowPid.find(id);
    if (found == gWindowPid.end()) return copyString("{\"error\":\"window_not_found\"}");
    AXUIElementRef window = windowElement(id, found->second);
    if (!window) return copyString("{\"error\":\"window_not_found\"}");

    std::string out = "{\"nodes\":[";
    bool truncated = false;
    int count = 0;
    std::string body;
    walk(window, 0, (int)depth, (int)max_nodes, body, truncated, count);
    CFRelease(window);
    out += body;
    out += "],\"truncated\":";
    out += truncated ? "true" : "false";
    out += "}";
    return copyString(out);
}

char *yonder_desktop_screenshot(const char *window_id) {
    CGRect bounds = CGRectNull;
    CGWindowID window = kCGNullWindowID;
    if (window_id && window_id[0] != '\0') {
        std::string id = window_id;
        auto found = gWindowBounds.find(id);
        if (found == gWindowBounds.end()) {
            // Screenshot may be the first call for this id: rebuild the cache once.
            char *discard = yonder_desktop_list_windows();
            free(discard);
            found = gWindowBounds.find(id);
            if (found == gWindowBounds.end()) return copyString("{\"error\":\"window_not_found\"}");
        }
        bounds = found->second;
        window = (CGWindowID)atoi(id.c_str());
    }
    // Best resolution so a Retina window comes back at full pixel density; the caller sees pixel
    // dimensions distinct from the window's point size. `CGWindowListCreateImage` is marked
    // unavailable from macOS 15 in the SDK (ScreenCaptureKit is the replacement there), but the symbol
    // still works; resolve it with `dlsym` so the same code builds and runs across versions without
    // depending on the obsoleted declaration.
    CGWindowListOption option = (window != kCGNullWindowID)
        ? kCGWindowListOptionIncludingWindow
        : kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
    static CGImageRef (*createImage)(CGRect, CGWindowListOption, CGWindowID, CGWindowImageOption) =
        (CGImageRef(*)(CGRect, CGWindowListOption, CGWindowID, CGWindowImageOption))
            dlsym(RTLD_DEFAULT, "CGWindowListCreateImage");
    if (!createImage) return copyString("{\"error\":\"operation_failed\"}");
    CGImageRef image = createImage(bounds, option, window,
        kCGWindowImageBoundsIgnoreFraming | kCGWindowImageBestResolution);
    if (!image) return copyString("{\"error\":\"desktop_permission_required\"}");
    size_t width = CGImageGetWidth(image);
    size_t height = CGImageGetHeight(image);
    std::string base64 = pngBase64(image);
    CGImageRelease(image);
    if (base64.empty()) return copyString("{\"error\":\"operation_failed\"}");
    std::string out = "{\"image\":{\"base64\":\"" + base64 + "\",\"mimeType\":\"image/png\",\"width\":" +
                      std::to_string(width) + ",\"height\":" + std::to_string(height) + "}}";
    return copyString(out);
}

char *yonder_desktop_input(const char *json, bool foreground) {
    if (!json) return copyString("{\"error\":\"path_invalid\"}");
    NSData *data = [NSData dataWithBytes:json length:strlen(json)];
    NSDictionary *request = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![request isKindOfClass:NSDictionary.class]) return copyString("{\"error\":\"path_invalid\"}");
    std::string id = nsToUtf8(request[@"windowId"]);
    std::string action = nsToUtf8(request[@"action"]);
    auto pidIt = gWindowPid.find(id);
    auto boundsIt = gWindowBounds.find(id);
    if (pidIt == gWindowPid.end() || boundsIt == gWindowBounds.end()) {
        // Input may be the first call for this id: rebuild the cache once.
        char *discard = yonder_desktop_list_windows();
        free(discard);
        pidIt = gWindowPid.find(id);
        boundsIt = gWindowBounds.find(id);
    }
    if (pidIt == gWindowPid.end() || boundsIt == gWindowBounds.end())
        return copyString("{\"error\":\"window_not_found\"}");
    pid_t pid = pidIt->second;
    CGRect window = boundsIt->second;

    if (action == "click" || action == "drag") {
        NSString *ref = request[@"ref"];
        if ([ref isKindOfClass:NSString.class]) {
            NSInteger index = atoi(ref.UTF8String + 1);  // strip the leading 'n'
            if (index < 0 || (size_t)index >= gRefs.size()) return copyString("{\"error\":\"element_not_found\"}");
            AXUIElementRef element = gRefs[index];
            if (action == "click") {
                AXError error = AXUIElementPerformAction(element, kAXPressAction);
                if (error != kAXErrorSuccess) return copyString("{\"error\":\"element_not_found\"}");
                return copyString("{\"changed\":true}");
            }
            // A drag needs two points; an element gives only one, so it cannot be dragged.
            return copyString("{\"error\":\"element_not_found\"}");
        }
        double x = [request[@"x"] doubleValue];
        double y = [request[@"y"] doubleValue];
        CGPoint start = CGPointMake(window.origin.x + x, window.origin.y + y);
        if (action == "click") {
            postMouse(mouseEvent(kCGEventMouseMoved, start, kCGMouseButtonLeft), pid, foreground);
            postMouse(mouseEvent(kCGEventLeftMouseDown, start, kCGMouseButtonLeft), pid, foreground);
            postMouse(mouseEvent(kCGEventLeftMouseUp, start, kCGMouseButtonLeft), pid, foreground);
            return copyString("{}");
        }
        CGPoint end = CGPointMake(window.origin.x + [request[@"toX"] doubleValue],
                                  window.origin.y + [request[@"toY"] doubleValue]);
        postMouse(mouseEvent(kCGEventLeftMouseDown, start, kCGMouseButtonLeft), pid, foreground);
        for (int step = 1; step <= 4; step++) {
            CGPoint mid = CGPointMake(start.x + (end.x - start.x) * step / 4.0,
                                      start.y + (end.y - start.y) * step / 4.0);
            postMouse(mouseEvent(kCGEventLeftMouseDragged, mid, kCGMouseButtonLeft), pid, foreground);
        }
        postMouse(mouseEvent(kCGEventLeftMouseUp, end, kCGMouseButtonLeft), pid, foreground);
        return copyString("{}");
    }
    if (action == "type") {
        std::string before = focusedValue(pid);
        NSString *text = request[@"text"];
        postText((NSString *)text, pid, foreground);
        std::string after = focusedValue(pid);
        bool known = !before.empty() || !after.empty();
        return copyString(known ? std::string("{\"changed\":") + (before != after ? "true" : "false") + "}"
                                : "{\"changed\":null}");
    }
    if (action == "key") {
        std::string before = focusedValue(pid);
        bool ok = postKey(nsToUtf8(request[@"key"]), pid, foreground);
        if (!ok) return copyString("{\"error\":\"path_invalid\"}");
        std::string after = focusedValue(pid);
        bool known = !before.empty() || !after.empty();
        return copyString(known ? std::string("{\"changed\":") + (before != after ? "true" : "false") + "}"
                                : "{\"changed\":null}");
    }
    if (action == "scroll") {
        CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
        int delta = (int)[request[@"deltaY"] doubleValue];
        CGEventRef event = CGEventCreateScrollWheelEvent(source, kCGScrollEventUnitLine, 1, delta);
        if (source) CFRelease(source);
        if (event) {
            foreground ? CGEventPost(kCGHIDEventTap, event) : CGEventPostToPid(pid, event);
            CFRelease(event);
        }
        return copyString("{}");
    }
    return copyString("{\"error\":\"path_invalid\"}");
}

void yonder_desktop_free(void *ptr) { free(ptr); }

}  // extern "C"
