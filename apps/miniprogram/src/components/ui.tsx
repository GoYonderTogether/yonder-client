import { Input, Button as NativeButton, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { type CSSProperties, type ReactNode, useEffect } from "react";
import { t, useLocale } from "../lib/i18n";
import { useSession } from "../lib/runtime";
import { navigationLayout, pageDestination } from "./navigation";

export function Page({
	title,
	back = true,
	children,
	publicPage = false,
	chatLayout = false,
	onMore,
}: {
	title: ReactNode;
	back?: boolean;
	children: ReactNode;
	publicPage?: boolean;
	chatLayout?: boolean;
	onMore?: () => void;
}) {
	const { status: sessionStatus } = useSession();
	const route = useRouter();
	const path = (route?.path || Taro.getCurrentPages().at(-1)?.route || "").split("?")[0];
	const protectedPage = !publicPage;
	const next = pageDestination(path, route?.params);
	useEffect(() => {
		if (protectedPage && sessionStatus === "signed-out")
			void Taro.reLaunch({ url: `/pages/sign-in/index?next=${encodeURIComponent(next)}` });
	}, [protectedPage, sessionStatus, next]);
	useLocale();
	const info = Taro.getWindowInfo();
	const capsule =
		process.env.TARO_ENV === "h5" ? { top: 0, left: 0, height: 0 } : Taro.getMenuButtonBoundingClientRect();
	const status = info.statusBarHeight || 0;
	const layout = navigationLayout(info.windowWidth, status, capsule);
	const h5Chat = chatLayout && process.env.TARO_ENV === "h5";
	const height = layout.barHeight;
	const headerHeight = status + height;
	const rightInset = h5Chat ? 16 : layout.rightInset;
	return (
		<View
			className={`mini-page ${chatLayout ? "mini-page-chat" : ""} ${h5Chat ? "mini-page-chat-h5" : ""}`}
			style={
				{
					"--mini-header-height": h5Chat
						? "calc(var(--titlebar-height) + env(safe-area-inset-top, 0px))"
						: `${headerHeight}px`,
				} as CSSProperties
			}
		>
			<View
				className="mini-nav"
				style={{
					paddingTop: h5Chat ? "env(safe-area-inset-top, 0px)" : `${status}px`,
					paddingRight: `${rightInset}px`,
				}}
			>
				<View className="mini-nav-inner" style={{ height: h5Chat ? "var(--titlebar-height)" : `${height}px` }}>
					{back && (
						<NativeButton
							className="mini-back"
							ariaLabel={t("返回", "Back")}
							onClick={() => {
								if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
								else void Taro.reLaunch({ url: "/pages/conversations/index" });
							}}
						>
							<View className="mini-nav-back-icon" />
						</NativeButton>
					)}
					{typeof title === "string" ? (
						<Text className="mini-nav-title">{title}</Text>
					) : (
						<View className="mini-nav-title">{title}</View>
					)}
					{onMore ? (
						<NativeButton className="mini-nav-more" ariaLabel={t("聊天设置", "Chat settings")} onClick={onMore}>
							<Text ariaHidden>⋯</Text>
						</NativeButton>
					) : null}
				</View>
			</View>
			<View className={`mini-content ${chatLayout ? "mini-content-chat" : ""}`}>
				{!protectedPage || sessionStatus === "signed-in" ? children : <State loading />}
			</View>
		</View>
	);
}
export function Button({
	children,
	onClick,
	loading,
	disabled,
	secondary,
	danger,
	share,
}: {
	children: ReactNode;
	onClick?: () => void;
	loading?: boolean;
	disabled?: boolean;
	secondary?: boolean;
	danger?: boolean;
	share?: boolean;
}) {
	return (
		<NativeButton
			className={`mini-button ${disabled || loading ? "mini-button-disabled" : ""} ${secondary ? "mini-button-secondary" : ""} ${danger ? "mini-button-danger" : ""}`}
			openType={share ? "share" : undefined}
			loading={loading}
			disabled={disabled || loading || undefined}
			onClick={onClick}
		>
			{children}
		</NativeButton>
	);
}
export function Field({
	label,
	value,
	onInput,
	password,
	placeholder,
	maxlength,
	type = "text",
}: {
	label: string;
	value: string;
	onInput: (value: string) => void;
	password?: boolean;
	placeholder?: string;
	maxlength?: number;
	type?: "text" | "number" | "digit";
}) {
	return (
		<View className="mini-field">
			<Text className="mini-label">{label}</Text>
			<Input
				className="mini-input"
				value={value}
				password={password}
				placeholder={placeholder}
				maxlength={maxlength}
				type={type}
				onInput={(event) => onInput(event.detail.value)}
			/>
		</View>
	);
}
export function Row({
	title,
	detail,
	onClick,
	danger,
}: {
	title: string;
	detail?: string;
	onClick?: () => void;
	danger?: boolean;
}) {
	return (
		<View className={`mini-row ${danger ? "mini-error" : ""}`} onClick={onClick}>
			<View className="mini-row-main">
				<Text>{title}</Text>
				{detail && <Text className="mini-muted">{detail}</Text>}
			</View>
			{onClick && <Text className="mini-muted">›</Text>}
		</View>
	);
}
export function State({
	loading,
	error,
	empty,
	retry,
}: {
	loading?: boolean;
	error?: string;
	empty?: string;
	retry?: () => void;
}) {
	return (
		<View className="mini-state">
			{loading && <Text className="mini-muted">{t("加载中…", "Loading…")}</Text>}
			{error && (
				<>
					<Text className="mini-error">{error}</Text>
					{retry && (
						<Button secondary onClick={retry}>
							{t("重试", "Retry")}
						</Button>
					)}
				</>
			)}
			{!loading && !error && empty && <Text className="mini-muted">{empty}</Text>}
		</View>
	);
}
export function errorText(error: unknown): string {
	return error instanceof Error ? error.message : t("操作失败，请重试", "Something went wrong. Please retry.");
}
export async function action(run: () => Promise<unknown>): Promise<void> {
	try {
		await run();
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"errMsg" in error &&
			typeof error.errMsg === "string" &&
			/:fail cancel$/.test(error.errMsg)
		)
			return;
		void Taro.showToast({ title: errorText(error), icon: "none" });
	}
}
export const go = (page: string) => {
	void Taro.navigateTo({ url: page.startsWith("/") ? page : `/pages/${page}/index` });
};
