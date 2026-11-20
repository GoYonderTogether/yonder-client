# 设计系统

界面用哪个变量、哪个组件、哪种页面骨架，以本文和代码为准。数值的唯一来源是
`packages/ui/tokens/src/tokens.css`；JS 需要数字的地方（lucide 的 `size`、Motion 弹簧）读
`packages/ui/tokens/src/scale.ts`，测试保证两边一致。`tools/check-ui-raw-values.mjs` 拦新增的原始值。

## 一、Tokens

### 字号（8 档，不加第九档）

| token          | 字号/行高 | 用在                                                             |
| -------------- | --------- | ---------------------------------------------------------------- |
| `text-display` | 40/48     | 额度大数字                                                       |
| `text-title`   | 30/38     | 公开页（定价、下载）的页面主标题                                 |
| `text-h1`      | 24/32     | 登录、引导、法律页的主标题                                       |
| `text-h2`      | 20/28     | 资料头的名字、区块标题                                           |
| `text-h3`      | 16/24     | TopBar 标题、Overlay 标题、EmptyState 标题，都配 `font-semibold` |
| `text-body`    | 15/22     | 正文、行标题、按钮 md/lg                                         |
| `text-caption` | 13/20     | 行副标题、说明、错误、按钮 sm                                    |
| `text-micro`   | 11/14     | Badge、标签栏文字                                                |

字重只写 `font-normal/medium/semibold/bold` 或 `var(--font-weight-*)`；深色主题自动减 40（360–660），写数字就跟不上。

### 间距、圆角、尺寸

| 类别       | token                         | 值                          | 什么时候用                                   |
| ---------- | ----------------------------- | --------------------------- | -------------------------------------------- |
| 间距       | `--spacing-1…16`              | 4 8 12 16 20 24 32 40 48 64 | 一切内外边距、间隙                           |
| 细间隙     | `--spacing-hair`              | 2                           | 只给上下相邻的列表行、标签图标和文字之间     |
| 页面内边距 | `--page-padding`              | 24，紧凑 16                 | `PageFrame` 自动使用，页面不再写             |
| 卡片内边距 | `--card-padding`              | 20，紧凑 16                 | `Card` 自动使用                              |
| 圆角       | `--radius-xs`                 | 4                           | Badge、Segmented sm 的段                     |
|            | `--radius-control-sm`         | 8                           | sm 控件、菜单项、IconTile                    |
|            | `--radius-control`            | 12                          | md/lg 控件、Banner、菜单面板                 |
|            | `--radius-card`               | 16                          | 卡片、`ListGroup`                            |
|            | `--radius-panel`              | 22                          | 弹窗、底部面板                               |
|            | `--radius-full`               | 9999                        | 头像、胶囊、开关                             |
| 控件高     | `--control-sm/md/lg`          | 32/40/48                    | 同一行的东西同一档                           |
| 行高       | `--row-height`                | 52，紧凑 60                 | `ListRow`、`LoadingRow`、inline `EmptyState` |
| 图标       | `--icon-sm/md/lg`             | 16/20/24                    | 见第八节                                     |
| 描边       | `--icon-stroke` / `-selected` | 1.75 / 2.1                  | 见第八节                                     |
| 禁用       | `--opacity-disabled`          | 0.6                         | 所有禁用态，含小程序（待对齐）               |

`--radius-sm/md/lg/xl` 是旧别名，已废弃：新代码不用，页面整理时换成角色名后删掉。

### 内容宽度

| token             | 值   | 用在                                 |
| ----------------- | ---- | ------------------------------------ |
| `--width-form`    | 400  | 登录、找回密码、引导、换手机号       |
| `--width-sheet`   | 560  | 普通弹层、成员名片页                 |
| `--width-reading` | 680  | 「我」的设置页、任务详情、聊天消息列 |
| `--width-wide`    | 880  | 群资料、建群、附件预览               |
| `--width-max`     | 1024 | 公开页头尾、定价、下载               |

### 层级（z-index）

| token         | 值  | 用在                         |
| ------------- | --- | ---------------------------- |
| `--z-sticky`  | 10  | 吸顶的页头、设备导航         |
| `--z-dock`    | 20  | 手机底部 dock、「我」面板    |
| `--z-popover` | 50  | 菜单、下拉、补全             |
| `--z-overlay` | 60  | `Overlay` 和 `ConfirmDialog` |
| `--z-toast`   | 70  | 以后的 Toast                 |

同一层内部的先后（1、2、-1）靠文档顺序或局部 `isolate`，不新增数字。

### 颜色

只用语义名：`--color-bg-*`（base 页面、chrome 侧栏、surface 浮层、raised 浮起的浮层、subtle 次级块、hover/active/selected 交互）、`--color-text-primary/secondary/tertiary`、`--color-border-subtle/default/strong`、`--color-accent*`、`--color-danger*`、`--color-warning*`、`--color-success`。头像、记忆、媒体有专用色。新增 `--color-warning-subtle`（Banner warning 底）和 `--color-switch-thumb`（开关滑块，两种主题都是白）。

**卡片和它所在的面对比，不和自己比。** 页面是白的，页面上的卡片就是灰的；列表列、侧栏是灰的（`.yonder-chrome`），里面的卡片就是白的。组件只读 `--color-bg-card`，由所在容器通过 `data-surface="chrome"` 决定用哪一半，所以同一个组件放进哪一列都自动对；页面和面板用 `--color-bg-page` 表示自己这一面的颜色（时间轴节点的镂空环用它）。`--color-bg-surface` 只留给浮在一切之上的面（对话框、菜单），它不进这个互换，因为浮层永远比底下那一层亮/暗一档。

规则的理由：浅色主题里白页配白卡，边界只能靠阴影，而阴影在小面积上几乎看不见（收藏、任务列表就是这样糊掉的）。灰卡落在白页上，边界是颜色本身。深色主题原本就是这个结构（页面 `#16161a`、卡片 `#232429`），浅色补上之后两个主题是同一种层次。

## 二、组件目录

| 场景         | 组件                                       | 包         | 主要 props                                                                                                                             |
| ------------ | ------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 按钮         | `Button`                                   | components | `variant` primary/secondary/ghost/danger/link，`size` sm/md/lg，`loading`，`block`                                                     |
| 图标按钮     | `IconButton`                               | components | `aria-label` 必填，`size` sm/md                                                                                                        |
| 文字链接按钮 | `Button variant="link" size="sm"`          | components | 不再手写 `text-accent-text hover:underline`                                                                                            |
| 卡片面       | `Card` + `CardHeader/Body/Footer`          | components | `variant` plain/raised/interactive                                                                                                     |
| 设置列表     | `ListGroup` + `ListRow`                    | components | 行：`leading` `title` `subtitle` `trailing` `chevron`；`static` 纯展示；`value` 当前值；`control` 放 `Switch`/`Checkbox`，整行是 label |
| 会话列表     | `ConversationRow`                          | components | —                                                                                                                                      |
| 开关         | `Switch`                                   | components | 原生 checkbox + `role="switch"`；`busy`；用于立即生效的设置                                                                            |
| 勾选         | `Checkbox`                                 | components | 需要点保存的选择                                                                                                                       |
| 分段         | `Segmented`                                | components | `size` sm（桌面工具栏 32）/ lg（列表顶部满宽胶囊）                                                                                     |
| 菜单         | `Menu`                                     | components | `label` `items`（id/label/icon/tone/disabled）`onSelect` `trigger`（渲染触发按钮）                                                     |
| 浮出面       | `MenuSurface`、`MENU_SURFACE`、`MENU_ITEM` | components | 补全、附件菜单等自定义内容的外壳；`Popover`/`Listbox` 已用它                                                                           |
| 徽标         | `Badge`                                    | components | `tone` neutral/accent/danger；micro，圆角 xs                                                                                           |
| 提示条       | `Banner`                                   | components | `tone` info/warning/danger，`icon`，`action`；一页一条                                                                                 |
| 行内错误     | `InlineError`                              | components | `onRetry` + `retryLabel`；`as="li"` 放进列表                                                                                           |
| 加载         | `LoadingRow`、`Spinner`                    | components | `LoadingRow label`；`Spinner size` sm/md/lg，`label` 时是 status                                                                       |
| 空状态       | `EmptyState`                               | components | `variant` page（整屏）/ inline（列表里一行），`as="li"`，`action`                                                                      |
| 页面骨架     | `PageFrame`、`ListFrame`                   | shell      | `PageFrame width` form/sheet/reading/wide/full                                                                                         |
| 页头         | `TopBar`                                   | shell      | 只经 `PageFrame`/`ListFrame` 用，页面不自己画                                                                                          |
| 弹层         | `Overlay`                                  | shell      | `wide`，`mobilePresentation` page/sheet，`footer`，`padded`                                                                            |
| 确认         | `ConfirmDialog`                            | shell      | `title` `body` `confirmLabel` `cancelLabel` `onConfirm` `onCancel` `tone` danger/primary `busy` `error`                                |

组件不带文案：所有可见文字由调用方 `t()` 传入，`zh-CN` 和 `en` 都要有。

## 三、页面骨架

| 页面类型                                   | 骨架                     | 宽度                                |
| ------------------------------------------ | ------------------------ | ----------------------------------- |
| 标签页列表（消息、任务、记忆、「我」列表） | `ListFrame`              | 列宽（260–420）                     |
| 「我」的设置页、任务详情                   | `PageFrame`              | `reading` 680                       |
| 连接器这类需要横向空间的设置页             | `PageFrame`              | `wide` 880                          |
| 对话                                       | `PageFrame width="full"` | 消息列 680                          |
| 登录、找回密码、引导                       | `AuthFrame` 内一列       | `form` 400                          |
| 普通弹层（Bot 详情、成员名片、子弹层）     | `Overlay`                | `sheet` 560                         |
| 群资料、建群                               | `Overlay wide`           | `wide` 880                          |
| 公开页（定价、下载、法律）                 | `PublicLayout`           | 头尾 `max` 1024，正文 `reading` 680 |

页面不写外边距、不写 `max-w-[Npx]`，只选宽度。现有页面里和这张表不一致的（法律页 768、成员页手写头、setup 自己的 400 列）由页面整理时迁移。

## 四、页头

- 只有一个 `TopBar`：左（头像或返回，由 shell 决定）、中（当前打开的东西的名字，或 Segmented）、右（操作）。标签页根页面不写标签名。
- `Overlay` 头和 TopBar 同一个标题样式：`text-h3 font-semibold`。桌面右上角关闭是 `X` 20，手机页面式弹层左上角返回是 `ChevronLeft` 24。
- 返回、Esc、滑动退出、点遮罩走同一个出口。

## 五、对话框

- 桌面居中，`sheet` 560 或 `wide` 880，圆角 panel，阴影 lg。手机上对话框（确认、短表单）用 `mobilePresentation="sheet"` 从底部升起；内容多的弹层可以整页。
- 内容区新弹层一律 `padded`（20）；操作放 `footer`：靠右，间距 12，取消在左，主要或危险操作在右。
- 危险操作一律经 `ConfirmDialog`：不用 `window.confirm`，不用行内展开确认，不直接执行。失败原因用 `error` 显示在按钮上方。

## 六、列表和分隔

- 设置项只用 `ListGroup` + `ListRow`。一个分组就是一张卡片，行之间用 `ListRow` 自带的虚线分隔，最后一行没有；卡片之间的间距就是分组之间的距离。
- 不写 `border-b` 贯穿整行的分隔，不在行外再画 `h-px`。
- 分组标题用 `ListGroup title`（caption medium tertiary），放在卡片上方。

## 七、错误、加载、空

| 状态     | 用                                    | 不用                                                  |
| -------- | ------------------------------------- | ----------------------------------------------------- |
| 局部失败 | `InlineError`（真实原因 + 可选重试）  | 复制 `text-caption text-danger` 的 `<p role="alert">` |
| 整页失败 | `EmptyState` + 重试按钮               | 空白页                                                |
| 加载中   | `LoadingRow`；按钮内用 `loading`      | 裸 `<p role="status">加载中</p>`、自己画的转圈        |
| 列表为空 | `EmptyState variant="inline" as="li"` | 灰字 `<p>`、禁用的 `ListRow`                          |
| 整屏为空 | `EmptyState`                          | 「以后这里会有什么」的说明                            |
| 持续提示 | `Banner`                              | 手写 `rounded bg-subtle px-4 py-2` 提示条             |

## 八、图标

- 只用 `lucide-react`。尺寸只有 `ICON_SIZE.sm/md/lg` = 16/20/24：行内和行首 16，控件里和关闭 20，返回箭头和手机标签栏 24。
- 描边 `ICON_STROKE.normal` 1.75，选中（标签栏当前项）`ICON_STROKE.selected` 2.1。
- 只有图标的按钮必须有 `aria-label`；装饰性图标 `aria-hidden`。

## 九、动效

| 场景                     | token                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| 颜色、hover、按下        | `--duration-fast` 120 + `--ease-standard`                                          |
| 元素进入、弹层出现       | `--duration-base` 200 + `--ease-decelerate`（`animate-pop-in`、`animate-fade-in`） |
| 元素退出                 | `--duration-fast` + `--ease-accelerate`                                            |
| 页面推入、底部面板       | `--duration-slow` 300（`animate-push-in`、`animate-sheet-up`）                     |
| 大块内容首次出现（少用） | `--duration-slower` 480                                                            |
| 跟手面板松手、进出       | `SPRING.panel`（`--spring-panel-*` 500/46），`GesturePanel` 已用                   |
| 分栏拖拽松手             | `SPRING.pane`（`--spring-pane-*` 1200/80，过阻尼不回弹）                           |
| 复制、点赞等反馈         | `--ease-feedback` + `--feedback-duration`                                          |
| 转圈                     | `animate-spinner`（800ms 线性）                                                    |

系统开了减少动态效果时 tokens 把时长设为 0，用 token 的动画自动关掉；写死时长的要自己加媒体查询，所以不要写死。

## 十、深色模式

- 只换 `data-theme`，组件不写 `dark:`、不写色值。
- 深色字重整体减 40，所以字重必须走 token。
- 深色和浅色是同一种层次：页面和卡片差一档，靠 `--color-bg-page` / `--color-bg-card` 这一对表达，深色只是往上加一档而不是往下压一档。浮层再亮一档（`bg-raised`），阴影只是辅助。
- 例外：`AmbientField` 着色器参数、App 图标色、`--color-switch-thumb` 两种主题相同，都在 tokens 或其组件里登记。

## 十一、小程序对应

小程序只共享 tokens（`generate-tokens.mjs` 生成）、`auth-presentation`、`chat-presentation`，组件是 Taro 重写。以后按下表对齐外观：

| 小程序 `components/ui.tsx` | 对应 Web                                           | 现在的差别                                |
| -------------------------- | -------------------------------------------------- | ----------------------------------------- |
| `Page`                     | `TopBar` + `PageFrame`                             | 标题左对齐、返回是字符 `‹`                |
| `Button`                   | `Button`                                           | 只有 48 高块级一种                        |
| `Field`                    | `TextField`                                        | 48 高，无聚焦样式                         |
| `Row`                      | `ListRow`                                          | 48 高，无细线，箭头是字符 `›`             |
| `State`                    | `LoadingRow` / `InlineError` / `EmptyState inline` | 一个组件合三态                            |
| `.mini-card`               | `Card` / `ListGroup`                               | 小程序还没跟 `--color-bg-card` 的对比规则 |
| `.mini-avatar`             | `Avatar`                                           | Bot 也是圆形，色固定                      |
| `.mini-badge`              | `Badge`                                            | 圆角全圆、body 字号                       |
| `Taro.showToast`           | 无（Web 没有 Toast）                               | —                                         |
| 字符 `× ↑ ✓`               | lucide `X` `ArrowUp` `Check`                       | 应改成 SVG                                |

禁用透明度小程序是 0.5，对齐时改成 `--opacity-disabled`。

## 十二、和设计稿 02 的差异

`yonder/docs/design/02-视觉样式.md` 只声明了「色值以代码为准」。下面这些也**以 `tokens.css` 为准**，02 需要按此更新：

| 项                | 02                                       | tokens.css                                                      |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------- |
| h1 / h2 / h3      | 28/36、22/30、18/26                      | 24/32、20/28、16/24                                             |
| body / micro 行高 | 24、16                                   | 22、14                                                          |
| `title` 档        | 没有                                     | 30/38；02 的 `body-strong` 在代码里是 `text-body font-semibold` |
| 圆角              | sm 6、md 10、lg 14、xl 20                | control-sm 8、control 12、card 16、panel 22，按角色命名         |
| 间距变量名        | `--space-*`                              | `--spacing-*`，另有 `--spacing-hair` 2                          |
| `duration-slow`   | 320（03 也是）                           | 300；新增 `duration-slower` 480 与 03 一致                      |
| `ease-decelerate` | `cubic-bezier(0, 0, 0, 1)`               | `cubic-bezier(0.05, 0.7, 0.1, 1)`                               |
| `ease-accelerate` | `cubic-bezier(0.3, 0, 1, 1)`             | `cubic-bezier(0.3, 0, 0.8, 0.15)`                               |
| 阴影 sm / md / lg | 0.06；8/24 0.08；16/48 0.12              | 0.05；10/30 0.08；24/64 0.14                                    |
| 图标描边          | 第八节 1.5（16 时 1.25）；第零节 1.6–2.1 | 1.75，选中 2.1                                                  |
| 密度              | 行高 48/40、控件 36/32、body 15/14       | 行高 52/60（紧凑更高）、控件固定 32/40/48、字号不随密度变       |
| 颜色              | 第二节暖灰、`#111`                       | Semi 默认主题（02 已声明以代码为准）                            |
| 深色字重          | 没写                                     | 360/460/560/660                                                 |

04-组件 第二节的按钮 36/44、IconButton 28/36 同样以代码的 32/40/48、32/40 为准（04 第零节已改）。
