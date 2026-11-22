import { ListGroup, ListRow } from "@yonder/ui-components";
import { useMe } from "@yonder/ui-data";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface LoginMethodsProps {
	/** Opens the change-phone page. */
	onChangePhone: () => void;
	wechatLink?: ReactNode;
}

/**
 * Every way this account can sign in, one row per bound method. WeChat identifiers stay on the server.
 */
export function LoginMethods({ onChangePhone, wechatLink }: LoginMethodsProps) {
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
			{me.data ? wechatLink : null}
		</ListGroup>
	);
}
