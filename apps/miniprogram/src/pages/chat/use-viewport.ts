import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { navigationLayout } from "../../components/navigation";
import { chatViewportHeight, safeBottomInset } from "./viewport";

function h5SafeInsets() {
	const probe = document.createElement("div");
	probe.style.cssText =
		"position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top, 0px);padding-bottom:env(safe-area-inset-bottom, 0px)";
	document.body.appendChild(probe);
	const style = getComputedStyle(probe);
	const insets = { top: Number.parseFloat(style.paddingTop) || 0, bottom: Number.parseFloat(style.paddingBottom) || 0 };
	probe.remove();
	return insets;
}

function measure(keyboardHeight: number, baselineHeight?: number, visualHeight?: number) {
	const info = Taro.getWindowInfo();
	const capsule =
		process.env.TARO_ENV === "h5" ? { top: 0, left: 0, height: 0 } : Taro.getMenuButtonBoundingClientRect();
	const header =
		process.env.TARO_ENV === "h5"
			? (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--titlebar-height")) || 52) +
				h5SafeInsets().top
			: navigationLayout(info.windowWidth, info.statusBarHeight || 0, capsule).headerHeight;
	const height = visualHeight ?? info.windowHeight;
	const baseline = baselineHeight ?? info.windowHeight;
	const safeBottom =
		process.env.TARO_ENV === "h5" ? h5SafeInsets().bottom : safeBottomInset(info.screenHeight, info.safeArea?.bottom);
	return {
		contentHeight: chatViewportHeight(height, baseline, header, safeBottom, keyboardHeight),
		keyboardVisible: keyboardHeight > 0,
	};
}

export function useChatViewport() {
	const [value, setValue] = useState(() => measure(0));
	const focused = useRef(false);
	const h5FocusHeight = useRef(0);
	useEffect(() => {
		if (process.env.TARO_ENV === "h5") {
			const visual = window.visualViewport;
			const update = () => {
				const height = visual?.height ?? window.innerHeight;
				const visibleBottom = Math.min(window.innerHeight, height + (visual?.offsetTop ?? 0));
				const keyboardVisible = height < window.innerHeight || (focused.current && height < h5FocusHeight.current - 1);
				if (keyboardVisible && focused.current && (visual?.scale ?? 1) === 1 && (window.scrollX || window.scrollY)) {
					window.scrollTo(0, 0);
				}
				const insets = h5SafeInsets();
				const header =
					(Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--titlebar-height")) || 52) +
					insets.top;
				const safeBottom = insets.bottom;
				setValue({
					contentHeight: Math.max(0, visibleBottom - header - (keyboardVisible ? 0 : safeBottom)),
					keyboardVisible,
				});
			};
			window.addEventListener("resize", update);
			window.addEventListener("scroll", update);
			visual?.addEventListener("resize", update);
			visual?.addEventListener("scroll", update);
			update();
			return () => {
				window.removeEventListener("resize", update);
				window.removeEventListener("scroll", update);
				visual?.removeEventListener("resize", update);
				visual?.removeEventListener("scroll", update);
			};
		}
		let keyboard = 0;
		let baseline = Taro.getWindowInfo().windowHeight;
		let baselineWidth = Taro.getWindowInfo().windowWidth;
		const update = () => {
			const info = Taro.getWindowInfo();
			const height = info.windowHeight;
			if (!keyboard && (!focused.current || info.windowWidth !== baselineWidth)) {
				baseline = height;
				baselineWidth = info.windowWidth;
			}
			setValue(measure(keyboard, baseline));
		};
		const onKeyboard = (event: { height: number }) => {
			keyboard = event.height;
			update();
		};
		Taro.onKeyboardHeightChange(onKeyboard);
		Taro.onWindowResize(update);
		update();
		return () => {
			Taro.offKeyboardHeightChange(onKeyboard);
			Taro.offWindowResize(update);
		};
	}, []);
	return {
		...value,
		onFocus: () => {
			if (process.env.TARO_ENV === "h5") h5FocusHeight.current = window.innerHeight;
			focused.current = true;
		},
		onBlur: () => {
			focused.current = false;
		},
	};
}
