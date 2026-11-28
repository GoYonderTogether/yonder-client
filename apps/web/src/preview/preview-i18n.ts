import { useTranslation } from "react-i18next";

const zh = {
	preview: "预览 {{name}}",
	close: "关闭预览",
	download: "下载原文件",
	imagePosition: "第 {{position}} 张 / 共 {{total}} 张",
	loading: "正在打开…",
	failed: "无法预览此文件，请下载原文件查看。",
	unsupported: "此格式暂不支持在线预览，可下载原文件。",
	mediaFailed: "当前设备无法播放此媒体格式，可下载原文件。",
	zoomIn: "放大",
	zoomOut: "缩小",
	fit: "适应窗口",
	rotate: "顺时针旋转",
	previous: "上一页",
	next: "下一页",
	page: "页码",
	pages: "共 {{count}} 页",
	semantic: "连续阅读",
	partial: "当前显示部分内容，可下载原文件查看完整内容。",
	tooLarge: "此文件超过在线预览上限，可下载原文件。",
	open: "打开 {{name}}",
};
const en: Record<keyof typeof zh, string> = {
	preview: "Preview {{name}}",
	close: "Close preview",
	download: "Download original",
	imagePosition: "{{position}} / {{total}}",
	loading: "Opening…",
	failed: "This file could not be previewed. Download the original to view it.",
	unsupported: "This format is not available for preview. Download the original.",
	mediaFailed: "This device cannot play this media format. Download the original.",
	zoomIn: "Zoom in",
	zoomOut: "Zoom out",
	fit: "Fit to window",
	rotate: "Rotate clockwise",
	previous: "Previous page",
	next: "Next page",
	page: "Page",
	pages: "{{count}} pages",
	semantic: "Continuous reading",
	partial: "Only part of the content is shown. Download the original for the complete file.",
	tooLarge: "This file exceeds the preview limit. Download the original.",
	open: "Open {{name}}",
};

export function usePreviewTranslation() {
	const { i18n } = useTranslation();
	const messages = i18n.resolvedLanguage?.startsWith("zh") ? zh : en;
	return (key: keyof typeof zh, values: Record<string, string | number> = {}) =>
		messages[key].replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""));
}
