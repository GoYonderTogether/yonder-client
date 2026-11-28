import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ApiError } from "@yonder/api-client";
import { splitTextAttachment } from "@yonder/chat-model";
import type { ConnectorFileTextPage } from "@yonder/protocol";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "../../components/ui";
import type { DeviceFileReading } from "../../lib/device-file-transfer";
import { t } from "../../lib/i18n";
import { MessageBody } from "../chat/markdown";

export function PagedDeviceText({
	first,
	load,
	refresh,
}: {
	first: ConnectorFileTextPage;
	load: (offset: number, hash: string, signal?: AbortSignal) => Promise<DeviceFileReading>;
	refresh: () => void;
}) {
	const [pages, setPages] = useState([first]);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const next = pages.at(-1)?.nextOffset ?? null;
	const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const tail = `device-page-tail-${id}-${next}`;
	useEffect(() => {
		if (next === null || failed) return;
		const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
		let active = true;
		let started = false;
		let observer: { disconnect: () => void } | undefined;
		const read = () => {
			if (!active || started) return;
			started = true;
			observer?.disconnect();
			setLoading(true);
			void load(next, first.sha256, controller?.signal)
				.then((page) => {
					if (!active) return;
					if (page.kind !== "text_page" || page.sha256 !== first.sha256 || page.offset !== next)
						throw new Error("conflict");
					setLoading(false);
					setPages((current) => [...current, page]);
				})
				.catch((error: unknown) => {
					if (!active) return;
					setLoading(false);
					if (
						(error instanceof ApiError && error.status === 409) ||
						(error instanceof Error && error.message === "conflict")
					)
						refresh();
					else setFailed(true);
				});
		};
		Taro.nextTick(() => {
			if (!active) return;
			if (process.env.TARO_ENV === "h5") {
				const element = document.getElementById(tail);
				if (!element) return;
				const web = new IntersectionObserver(
					(entries) => {
						if (entries.some(({ isIntersecting }) => isIntersecting)) read();
					},
					{ rootMargin: "0px 0px 400px" },
				);
				observer = web;
				web.observe(element);
				return;
			}
			const page = Taro.getCurrentInstance().page;
			if (!page) return;
			const native = Taro.createIntersectionObserver(page, { thresholds: [0, 0.01] });
			observer = native;
			native.relativeToViewport({ bottom: 400 }).observe(`#${tail}`, ({ intersectionRatio }) => {
				if ((intersectionRatio ?? 0) > 0) read();
			});
		});
		return () => {
			active = false;
			controller?.abort();
			observer?.disconnect();
		};
	}, [failed, first.sha256, load, next, refresh, tail]);
	const parts = useMemo(
		() => pages.map((page) => ({ ...page, parts: splitTextAttachment(page.content, 8192) })),
		[pages],
	);
	if (first.nextOffset === null && first.content.length <= 8192 && /\.(?:md|markdown)$/iu.test(first.name))
		return <MessageBody body={first.content} />;
	return (
		<View className="mini-device-file-text">
			{parts.map((page) => {
				let offset = 0;
				return page.parts.map((text) => {
					const key = `${page.offset}:${offset}`;
					offset += text.length;
					return (
						<Text key={key} selectable userSelect>
							{text}
						</Text>
					);
				});
			})}
			{next !== null ? <View id={tail} className="mini-device-file-text-tail" ariaHidden /> : null}
			{loading ? (
				<Text className="mini-device-updating" ariaRole="status">
					{t("正在加载下一页…", "Loading the next page…")}
				</Text>
			) : null}
			{failed ? (
				<Button secondary onClick={() => setFailed(false)}>
					{t("重试", "Retry")}
				</Button>
			) : null}
		</View>
	);
}
