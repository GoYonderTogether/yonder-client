/**
 * `@yonder/ui-components` — layer 2. The primitives: button, input, card, avatar, list, menu,
 * switch, badge, banner, inline error, spinner, empty state. Which one to use for which pattern is
 * in `docs/design-system.md`. They take props and nothing else: no data hooks, no global state,
 * no device checks.
 */

export type { AmbientFieldProps } from "./ambient/ambient-field.tsx";
export { AmbientField, DEFAULT_VEIL } from "./ambient/ambient-field.tsx";
export type { AvatarProps, AvatarSize } from "./avatar/avatar.tsx";
export { Avatar } from "./avatar/avatar.tsx";
export type { BotFaceId } from "./avatar/bot-face.tsx";
export { BOT_FACE_IDS, BotFace, botFaceFor } from "./avatar/bot-face.tsx";
export type { BadgeProps, BadgeTone } from "./badge/badge.tsx";
export { Badge } from "./badge/badge.tsx";
export { UnreadBadge } from "./badge/unread-badge.tsx";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./button/button.tsx";
export { Button } from "./button/button.tsx";
export type { CardProps } from "./card/card.tsx";
export { Card, CardBody, CardFooter, CardHeader } from "./card/card.tsx";
export type { CheckboxProps } from "./checkbox/checkbox.tsx";
export { Checkbox } from "./checkbox/checkbox.tsx";
export type { ClassValue } from "./cn.ts";
export { cn } from "./cn.ts";
export type { EmptyStateProps } from "./empty-state/empty-state.tsx";
export { EmptyState } from "./empty-state/empty-state.tsx";
export type { BannerProps, BannerTone } from "./feedback/banner.tsx";
export { Banner } from "./feedback/banner.tsx";
export type { InlineErrorProps } from "./feedback/inline-error.tsx";
export { InlineError } from "./feedback/inline-error.tsx";
export type { LoadingRowProps, SpinnerProps, SpinnerSize } from "./feedback/loading.tsx";
export { LoadingRow, Spinner } from "./feedback/loading.tsx";
export type { CodeFieldProps } from "./field/code-field.tsx";
export { CodeField } from "./field/code-field.tsx";
export type {
	FieldProps,
	FieldSize,
	InputFrameProps,
	TextAreaProps,
	TextFieldProps,
	TextInputProps,
} from "./field/field.tsx";
export { Field, InputFrame, TextArea, TextField, TextInput } from "./field/field.tsx";
export type { ListboxOption, ListboxProps } from "./field/listbox.tsx";
export { Listbox, Popover } from "./field/listbox.tsx";
export type { PasswordFieldProps } from "./field/password-field.tsx";
export { PasswordField } from "./field/password-field.tsx";
export type { PhoneFieldProps } from "./field/phone-field.tsx";
export { PhoneField } from "./field/phone-field.tsx";
export type { SearchInputProps } from "./field/search-input.tsx";
export { SearchInput } from "./field/search-input.tsx";
export type { SelectFieldProps } from "./field/select-field.tsx";
export { SelectField } from "./field/select-field.tsx";
export type { IconButtonProps } from "./icon-button/icon-button.tsx";
export { IconButton } from "./icon-button/icon-button.tsx";
export type { ConversationRowProps } from "./list/conversation-row.tsx";
export { ConversationList, ConversationRow } from "./list/conversation-row.tsx";
export type { ListRowProps } from "./list/list.tsx";
export {
	FormFooter,
	FormSection,
	IconTile,
	ListGroup,
	ListOption,
	ListRow,
	ListSwitch,
	ListValue,
} from "./list/list.tsx";
export type { LogoProps } from "./logo/logo.tsx";
export { AppIcon, Logo } from "./logo/logo.tsx";
export type { MenuItem, MenuProps, MenuSurfaceProps, MenuTriggerProps } from "./menu/menu.tsx";
export { MENU_ITEM, MENU_SURFACE, Menu, MenuSurface } from "./menu/menu.tsx";
export type { BrandedQrCodeProps } from "./qr-code/branded-qr-code.tsx";
export { BrandedQrCode } from "./qr-code/branded-qr-code.tsx";
export type { SegmentedProps, SegmentOption } from "./segmented/segmented.tsx";
export { Segmented } from "./segmented/segmented.tsx";
export type { SwitchProps } from "./switch/switch.tsx";
export { Switch } from "./switch/switch.tsx";
