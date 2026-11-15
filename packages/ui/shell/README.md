# @yonder/ui-shell

Layer 3: the frame. Where the panes go, how wide they are, what the top and bottom bars hold, and
how the three layers are entered and left.

The shell knows nothing about which features exist. It is handed slots; it decides their shape.

## What it holds

| file                        | what                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `layout/app-shell.tsx`      | picks two-pane / one-pane / mobile from its own width       |
| `layout/chat-pane.tsx`      | the left pane, collapsible to an avatar strip               |
| `layout/content-pane.tsx`   | the right pane: top bar, segmented control, scrolling body  |
| `layout/pane-splitter.tsx`  | the drag handle, keyboard-operable                          |
| `layout/mobile-tab-bar.tsx` | 对话 / 今天 / 任务 / 记忆                                   |
| `layout/detail-header.tsx`  | layer two's back control and trail                          |
| `overlay/overlay.tsx`       | layer three: a dialog on desktop, a bottom sheet on a phone |
| `responsive/layout-mode.ts` | 900 and 640, and the chat pane's width bounds               |
| `navigation/routes.ts`      | the route registry: every page's layer, parent and link     |
| `navigation/use-dismiss.ts` | one exit for Esc, back and swipe                            |

## The three layers

1. **Page** — desktop: the content pane's segments; mobile: the bottom tabs.
2. **Detail** — advances inside the content pane on desktop, full screen on a phone; one back.
3. **Overlay** — 「我」 and settings; a centred dialog on desktop, a sheet on a phone.

Layout is decided by **width**, never by device. Dragging a window narrow enough to pass 640 gives
the phone layout, which is the same tree.

## Rules

- Pages draw no margins and no top bars; the shell owns both.
- `useDismiss` is the only Esc listener; a feature never adds its own.
- The route registry is the only list of pages. A new page is a row there plus a component.
- May import tokens, i18n and components — never a feature, never data.
