import { Image, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { action, Button, Field, Page } from "../../components/ui";
import { t } from "../../lib/i18n";
import { api, client, uploadAvatar, useSession } from "../../lib/runtime";
import { signInDestination } from "../sign-in/destination";

export default function Profile() {
	const { me, refreshMe } = useSession();
	const params = useRouter().params;
	const setup = params.setup === "1";
	const [name, setName] = useState(me?.member.displayName || "");
	const [bio, setBio] = useState(me?.member.bio || "");
	const [busy, setBusy] = useState(false);
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
				{me?.member.avatarUrl && (
					<Image
						src={me.member.avatarUrl.startsWith("/") ? `${client.baseUrl}${me.member.avatarUrl}` : me.member.avatarUrl}
						className="mini-avatar"
					/>
				)}
				<Button
					secondary
					onClick={() =>
						void action(async () => {
							const result = await Taro.chooseMedia({
								count: 1,
								mediaType: ["image"],
								sourceType: ["album", "camera"],
							});
							await uploadAvatar(result.tempFiles[0].tempFilePath);
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
		</Page>
	);
}
