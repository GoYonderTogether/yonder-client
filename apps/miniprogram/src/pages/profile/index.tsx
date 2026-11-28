import { View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { ApiError } from "@yonder/api-client";
import { useEffect, useRef, useState } from "react";
import { RemoteAvatar } from "../../components/remote-avatar";
import { action, Button, errorText, Field, Page } from "../../components/ui";
import { t } from "../../lib/i18n";
import { api, uploadAvatar, useSession } from "../../lib/runtime";
import { signInDestination } from "../sign-in/destination";

/** The sentence for a refused handle change; the server's `message` is for developers. */
function handleProblem(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.code === "handle_taken") return t("这个 ID 已经有人用了", "That ID is already taken");
		if (error.code === "handle_reserved") return t("这个 ID 是保留词，换一个", "That ID is reserved");
		if (error.code === "handle_cooldown") {
			const next = typeof error.details?.nextChangeAt === "string" ? new Date(error.details.nextChangeAt) : null;
			return next
				? t(`${next.toLocaleDateString()} 之后才能再改`, `You can change it again after ${next.toLocaleDateString()}`)
				: t("最近刚改过，稍后再改", "You changed it recently. Try again later");
		}
		if (error.code === "invalid_request" && error.details?.field === "handle") {
			return t(
				"6–20 位，小写字母开头，只能用小写字母、数字、- 和 _",
				"6–20 characters, starting with a lowercase letter; lowercase letters, digits, - and _ only",
			);
		}
	}
	return errorText(error);
}

export default function Profile() {
	const { me, refreshMe } = useSession();
	const params = useRouter().params;
	const setup = params.setup === "1";
	const [name, setName] = useState(me?.member.displayName || "");
	const [bio, setBio] = useState(me?.member.bio || "");
	const [busy, setBusy] = useState(false);
	const [handle, setHandle] = useState("");
	const [handleBusy, setHandleBusy] = useState(false);
	const handleChange = me?.handleChange;
	const initialized = useRef(Boolean(me));
	useEffect(() => {
		if (!initialized.current && me) {
			setName(me.member.displayName);
			setBio(me.member.bio || "");
			initialized.current = true;
		}
	}, [me]);
	const save = () =>
		void action(async () => {
			setBusy(true);
			try {
				await api.updateMe({ displayName: name.trim(), bio: bio.trim() || null });
				await refreshMe();
				if (setup) await Taro.reLaunch({ url: signInDestination(params.next) });
				else await Taro.navigateBack();
			} finally {
				setBusy(false);
			}
		});
	return (
		<Page title={t("个人资料", "Profile")}>
			<View className="mini-card">
				{me?.member.avatarUrl && <RemoteAvatar src={me.member.avatarUrl} />}
				<Button
					secondary
					onClick={() =>
						void action(async () => {
							const result = await Taro.chooseMedia({
								count: 1,
								mediaType: ["image"],
								sourceType: ["album", "camera"],
							});
							const file = result.tempFiles[0];
							if (!file) return;
							await uploadAvatar({ path: file.tempFilePath, size: file.size });
							await refreshMe();
						})
					}
				>
					{t("更换头像", "Change avatar")}
				</Button>
				<Field label={t("昵称", "Display name")} value={name} onInput={setName} />
				<Field label={t("简介", "Bio")} value={bio} onInput={setBio} />
				<Button loading={busy} disabled={!name.trim()} onClick={save}>
					{t("保存", "Save")}
				</Button>
			</View>
			{!setup && me ? (
				<View className="mini-card">
					<Field
						label={t(`ID（当前 @${me.member.handle}）`, `ID (now @${me.member.handle})`)}
						value={handle}
						onInput={setHandle}
					/>
					{handleChange && !handleChange.canChange ? (
						<View>
							{t(
								`${new Date(handleChange.nextChangeAt ?? "").toLocaleDateString()} 之后才能再改`,
								`You can change it again after ${new Date(handleChange.nextChangeAt ?? "").toLocaleDateString()}`,
							)}
						</View>
					) : null}
					<Button
						loading={handleBusy}
						disabled={!handleChange?.canChange || !handle.trim() || handle.trim() === me.member.handle}
						onClick={() => {
							setHandleBusy(true);
							void (async () => {
								try {
									await api.changeHandle(handle.trim().toLowerCase());
									await refreshMe();
									setHandle("");
									void Taro.showToast({ title: t("已保存", "Saved"), icon: "success" });
								} catch (error) {
									void Taro.showToast({ title: handleProblem(error), icon: "none" });
								} finally {
									setHandleBusy(false);
								}
							})();
						}}
					>
						{t("修改 ID", "Change ID")}
					</Button>
				</View>
			) : null}
		</Page>
	);
}
