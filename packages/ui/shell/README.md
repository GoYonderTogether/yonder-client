# @yonder/ui-shell

第三层布局骨架：接收列表、详情和设置内容，负责位置、顶栏、导航层级与手势呈现，不读取业务数据。

## 布局和平台

容器宽度决定面板是否并排，宿主交互类型决定使用桌面侧栏还是手机底栏。应用通过 `desktop` 传入集中平台判断；桌面浏览器和桌面 Tauri 缩窄后仍是桌面界面。

| 容器宽度   | 桌面                             | 移动交互                           |
| ---------- | -------------------------------- | ---------------------------------- |
| ≥1024px    | `wide`：Rail、列表、详情并排     | `wide`                             |
| 640–1023px | `medium`：Rail 和列表，详情覆盖  | `medium`                           |
| <640px     | `compact`：Rail 和列表，详情覆盖 | `mobile`：列表与底部导航，详情覆盖 |

列表是根页面；详情从右进入、向右返回。“我”的根层由头像打开，从左进入、向左退出；具体设置页逐层从右进入、向右返回。展开时保留所需父页面，覆盖中的底层不可交互。

## 文件职责

| 文件                                                    | 职责                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `layout/app-shell.tsx`                                  | 主列表、详情和 Me 层的呈现，保留宽屏分栏                   |
| `layout/frames.tsx`                                     | 列表与页面的公共顶栏、滚动区域；`PageFrame` 的五种宽度     |
| `layout/rail.tsx`                                       | 桌面头像、消息、任务、记忆入口                             |
| `layout/mobile-dock.tsx`                                | 手机输入框与底部导航                                       |
| `layout/pane-splitter.tsx`、`layout/use-pane-layout.ts` | 宽屏分栏拖动、键盘调整与收起恢复                           |
| `navigation/gesture-panel.tsx`                          | 连续指针位移、方向、速度与 Motion 弹簧、覆盖层退出生命周期 |
| `navigation/use-dismiss.ts`                             | 顶层优先的 Esc 返回                                        |
| `navigation/routes.ts`                                  | 页面与 tab 的路由登记                                      |
| `overlay/overlay.tsx`                                   | 宽屏对话框，受限宽度下从右进入的操作层；底部操作区         |
| `overlay/confirm-dialog.tsx`                            | 所有确认：取消在左、操作在右，手机从底部升起               |
| `responsive/layout-mode.ts`                             | 宽度阈值、布局模式与列表宽度边界                           |

URL 和浏览器历史仍由应用的 React Router 管理；骨架只调用传入的返回动作，不创建第二套 URL 路由。已知父历史通过 pop 返回，刷新深链没有已知父历史时 replace 到语义父级。

手势识别横向移动后直接更新位置，释放时才运行弹簧。短拖、取消和被未保存变更拦截的返回应回弹；纵向滚动和输入控件保持可用。已提交的浏览器历史返回不通过反向拖动撤销。

整体分层见 [docs/architecture.md](../../../docs/architecture.md)。

## 分层约定

- 页面通过 `ListFrame` / `PageFrame` 使用骨架提供的顶栏与外边距；宽度怎么选见 `docs/design-system.md`。
- 共用 `useDismiss` 处理 Esc，不在功能页重复监听。
- 新页面同时登记路由和应用装配。
- 可引用 tokens、i18n、components 与 protocol，不引用 feature 或 data。
