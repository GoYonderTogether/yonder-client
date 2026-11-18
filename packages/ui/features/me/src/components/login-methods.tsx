import { ListGroup, ListRow } from "@yonder/ui-components";
import { useMe } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

export interface LoginMethodsProps {
	/** Opens the change-phone page. */
	onChangePhone: () => void;
}

/**
 * Every way this account can sign in, one row per bound method. The WeChat row only reports that
 * the mini program is linked; the open id stays on the server.
 */
export function LoginMethods({ onChangePhone }: LoginMethodsProps) {
	const { t } = useTranslation();
	const me = useMe();
	const methods = me.data?.signInMethods ?? [];
	return (
		<ListGroup title={t("me.loginMethods.title")}>
			{methods.length === 0 ? <ListRow title="—" disabled className="hover:bg-transparent" /> : null}
			{methods.map((method) =>
				method.channel === "sms" ? (
					<ListRow
						key="sms"
						title={t("me.loginMethods.sms")}
						trailing={<span className="tabular-nums">{method.masked}</span>}
						chevron
						onClick={onChangePhone}
					/>
				) : (
					<ListRow
						key="wechat"
						title={t("me.loginMethods.wechat")}
						trailing={t("me.loginMethods.wechatBound")}
						disabled
						className="hover:bg-transparent"
					/>
				),
			)}
		</ListGroup>
	);
}
