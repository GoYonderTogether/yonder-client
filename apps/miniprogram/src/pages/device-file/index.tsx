import { Text, View } from "@tarojs/components";
import { useDidShow, useLoad } from "@tarojs/taro";
import { type DeviceFileReference, deviceFileChild, deviceFileName } from "@yonder/chat-model";
import type { ConnectorInstance } from "@yonder/protocol";
import { useCallback, useEffect, useState } from "react";
import { Page, Row, State } from "../../components/ui";
import { takeDeviceFile } from "../../lib/device-file-navigation";
import type { DeviceFileReading } from "../../lib/device-file-transfer";
import { t } from "../../lib/i18n";
import { api, clearDeviceFileCache, downloadDeviceFile, subscribeEvents, useSession } from "../../lib/runtime";
import { PagedDeviceText } from "./paged-text";
import { DeviceFileBody } from "./reader";
import "./style.scss";

export default function DeviceFilePage() {
	const { me } = useSession();
	const [reference, setReference] = useState<DeviceFileReference>();
	const [choices, setChoices] = useState<ConnectorInstance[]>([]);
	const [result, setResult] = useState<DeviceFileReading>();
	const [source, setSource] = useState<ConnectorInstance>();
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const refresh = useCallback(() => setReference((current) => (current ? { ...current } : current)), []);
	useLoad(() => setReference(takeDeviceFile()));
	useDidShow(refresh);
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type !== "connectors.changed" && event.type !== "devices.changed") return;
				setResult(undefined);
				refresh();
			}),
		[refresh],
	);
	const accountId = me?.member.id;
	useEffect(() => {
		if (!reference || !accountId) return;
		let active = true;
		const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
		setLoading(true);
		setError("");
		setChoices([]);
		void load()
			.catch(() => {
				if (!active) return;
				setResult(undefined);
				setError(t("无法读取源设备上的文件", "Could not read the file on its device"));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
			controller?.abort();
		};

		async function load() {
			if (!reference) return;
			const { items } = await api.connectors();
			const connections = items.filter((item) => item.connectorId === "local-files");
			if (!active) return;
			let selected = connections.find((item) => item.id === reference.connectionId);
			if (!reference.connectionId) {
				const allowed = connections.filter((item) => item.scope === "device");
				if (allowed.length > 1) {
					setChoices(allowed);
					return;
				}
				selected = allowed[0];
			}
			if (!selected) {
				clearDeviceFileCache();
				setResult(undefined);
				setError(t("没有可读取此文件的授权设备", "No authorized device can read this file"));
				return;
			}
			setSource(selected);
			const value = await downloadDeviceFile(selected, reference.path, controller?.signal);
			if (active) setResult(value);
		}
	}, [accountId, reference]);
	const path = reference?.path;
	const loadPage = useCallback(
		(offset: number, expectedSha256: string, signal?: AbortSignal) => {
			if (!source || !path) return Promise.reject(new Error("file source unavailable"));
			return downloadDeviceFile(source, path, signal, { offset, expectedSha256 });
		},
		[path, source],
	);

	const open = (next: DeviceFileReference) => {
		setResult(undefined);
		setSource(undefined);
		setReference(next);
	};
	const title = result && result.kind !== "directory" ? result.name : path ? deviceFileName(path) : t("文件", "File");
	return (
		<Page title={title}>
			<View className="mini-device-file">
				{source?.deviceName ? <Text className="mini-muted">{source.deviceName}</Text> : null}
				{choices.map((connection) => (
					<Row
						key={connection.id}
						title={connection.deviceName ?? connection.name}
						onClick={() => reference && open({ ...reference, connectionId: connection.id })}
					/>
				))}
				{loading && result ? (
					<Text className="mini-device-updating" ariaRole="status">
						{t("正在检查更新…", "Checking for updates…")}
					</Text>
				) : null}
				{result && result.kind !== "directory" && result.stale ? (
					<Text className="mini-muted">{t("上次读取的版本", "Last available version")}</Text>
				) : null}
				{result?.kind === "file" ? <DeviceFileBody key={result.sha256} file={result} /> : null}
				{result?.kind === "text_page" ? (
					<PagedDeviceText key={result.sha256} first={result} load={loadPage} refresh={refresh} />
				) : null}
				{result?.kind === "directory" && reference ? (
					<>
						{result.entries.map((entry) => {
							const path = deviceFileChild(reference.path, entry.name);
							return path ? (
								<Row
									key={entry.name}
									title={entry.name}
									detail={entry.type === "directory" ? t("文件夹", "Folder") : undefined}
									onClick={() => open({ path, connectionId: source?.id ?? reference.connectionId })}
								/>
							) : null;
						})}
						{result.truncated ? (
							<Text className="mini-muted">{t("仅显示部分条目", "Some entries are hidden")}</Text>
						) : null}
						{!result.entries.length ? <State empty={t("文件夹为空", "This folder is empty")} /> : null}
					</>
				) : null}
				{!result && !choices.length ? (
					<State
						loading={loading || Boolean(reference && !error)}
						error={error || undefined}
						empty={!reference ? t("请从对话打开文件", "Open the file from your chat") : undefined}
						retry={reference ? refresh : undefined}
					/>
				) : null}
			</View>
		</Page>
	);
}
