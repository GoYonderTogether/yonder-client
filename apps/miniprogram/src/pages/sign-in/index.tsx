import { Image, Input, Button as NativeButton, Picker, Text, View } from "@tarojs/components";
import { AuthActions, AuthConsent, AuthFrame, type AuthHost, AuthStack, AuthTitle } from "@yonder/auth-presentation";
import logo from "./logo.svg";
import darkLogo from "./logo-dark.svg";
import "./style.scss";
import Taro, { useRouter } from "@tarojs/taro";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Button, SessionRestoreState } from "../../components/ui";
import { t, useLocale } from "../../lib/i18n";
import { api, deviceInfo, uploadAvatar, useSession } from "../../lib/runtime";

import { Consent } from "./consent";
import { signInDestination } from "./destination";
import { Field } from "./field";
import { phoneGate, smsGate, wechatGate } from "./wechat";
import { authFailure, wechatError } from "./wechat-error";

const AuthView = View as unknown as AuthHost;
export default function SignIn() {
	const params = useRouter().params;
	const { locale, setLocale } = useLocale();
	const [privacy, setPrivacy] = useState(false);
	const [ticket, setTicket] = useState("");
	const [ticketExpires, setTicketExpires] = useState(0);
	const [entry, setEntry] = useState<"wechat" | "phone" | "profile">("wechat");
	const [avatar, setAvatar] = useState("");
	const [nickname, setNickname] = useState("");
	const next = signInDestination(params.next);
	const { status, startSession, refreshMe } = useSession();
	const signingIn = useRef(false);
	const sendingRef = useRef(false);
	const [mode, setMode] = useState<"code" | "password" | "reset">("code");
	const [phone, setPhone] = useState("");
	const [phoneStage, setPhoneStage] = useState(false);
	const [country, setCountry] = useState(0);
	const countries = ["+86", "+852", "+853", "+886", "+1", "+44", "+81", "+65"];
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [agree, setAgree] = useState(false);
	const [busy, setBusy] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState("");
	const [retryAt, setRetryAt] = useState(0);
	const [now, setNow] = useState(Date.now());
	const inviteCode = params.invite ?? "";
	const target = phone.trim().startsWith("+")
		? phone.replace(/[\s()-]/g, "")
		: `${countries[country]}${phone.replace(/[\s()-]/g, "").replace(/^0+/, "")}`;
	const valid = /^\+[1-9]\d{7,14}$/.test(target);
	const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
	useEffect(() => {
		if (!retryAt) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [retryAt]);
	useEffect(() => {
		if (status === "signed-in" && !signingIn.current && entry !== "profile") void Taro.reLaunch({ url: next });
	}, [status, next, entry]);
	const send = async () => {
		const gate = smsGate(sendingRef.current || busy, agree, seconds, valid);
		if (gate === "busy") return;
		if (gate === "terms") {
			setError(t("请先阅读并同意用户协议与隐私政策", "Please agree to the terms and privacy policy"));
			return;
		}
		if (gate === "invalid") {
			setError(
				t(
					"请输入有效手机号，国际号码请包含 + 区号",
					"Enter a valid phone number, including + country code internationally",
				),
			);
			return;
		}
		setError("");
		sendingRef.current = true;
		setSending(true);
		try {
			const result = await api.sendCode({
				channel: "sms",
				target,
				purpose: mode === "reset" ? "reset_password" : "sign_in",
			});
			setRetryAt(Date.now() + result.retryAfter * 1000);
			setPhoneStage(true);
			setNow(Date.now());
		} catch {
			setError(authFailure("send"));
		} finally {
			sendingRef.current = false;
			setSending(false);
		}
	};
	const submit = async () => {
		if (signingIn.current || busy) return;
		if (!valid || (!password && mode !== "code") || (!/^\d{6}$/.test(code) && mode !== "password")) {
			setError(t("请检查手机号、验证码或密码", "Check your phone number, verification code or password"));
			return;
		}
		if (!agree) {
			setError(t("请先阅读并同意用户协议与隐私政策", "Please agree to the terms and privacy policy"));
			return;
		}
		signingIn.current = true;
		setBusy(true);
		setError("");
		try {
			if (mode === "reset") {
				await api.resetPasswordWithCode({ channel: "sms", target, code, newPassword: password });
				setMode("password");
				setCode("");
				setPassword("");
				void Taro.showToast({ title: t("密码已重置", "Password reset"), icon: "success" });
				return;
			}
			const result =
				mode === "password"
					? await api.signInWithPassword({ target, password, device: deviceInfo() })
					: await api.signIn({
							channel: "sms",
							target,
							code,
							agreeTerms: true,
							device: deviceInfo(),
							...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
						});
			await finish(result);
		} catch {
			setError(authFailure(mode === "reset" ? "reset" : "sign-in"));
		} finally {
			signingIn.current = false;
			setBusy(false);
		}
	};
	const finish = async (result: { accessToken: string; refreshToken?: string; isNewAccount: boolean }) => {
		await startSession(result);
		if (result.isNewAccount) setEntry("profile");
		else await Taro.reLaunch({ url: next });
	};
	const wechat = async () => {
		const gate = wechatGate(busy || signingIn.current, agree, process.env.TARO_ENV !== "h5");
		if (gate === "busy") return;
		if (gate === "terms") {
			setError(t("请先阅读并同意用户协议与隐私政策", "Please agree to the terms and privacy policy"));
			return;
		}
		if (gate === "unavailable") {
			setError(t("请在微信小程序中使用微信登录", "WeChat sign-in is available in the mini program"));
			return;
		}
		signingIn.current = true;
		setBusy(true);
		setError("");
		try {
			if (Taro.getPrivacySetting) {
				const setting = await new Promise<Taro.getPrivacySetting.SuccessCallbackResult>((resolve, reject) =>
					Taro.getPrivacySetting({ success: resolve, fail: reject }),
				);
				if (setting.needAuthorization) {
					setPrivacy(true);
					return;
				}
			}
			const login = await Taro.login();
			const result = await api.wechatMiniSignIn({ loginCode: login.code, agreeTerms: true, device: deviceInfo() });
			if (result.status === "phone_required") {
				setTicket(result.ticket);
				setTicketExpires(Date.now() + result.expiresIn * 1000);
			} else await finish(result);
		} catch (e) {
			setError(wechatError(e));
		} finally {
			signingIn.current = false;
			setBusy(false);
		}
	};
	const phoneAuth = async (phoneCode?: string) => {
		const gate = phoneGate(busy || signingIn.current, agree, phoneCode, ticketExpires, Date.now());
		if (gate === "busy") return;
		if (gate === "terms") {
			setError(t("请先同意协议", "Please agree to the terms"));
			return;
		}
		if (gate === "declined") {
			setError(t("未授权手机号，可重试或使用手机号登录", "Phone access declined; retry or use phone sign-in"));
			return;
		}
		if (gate === "expired") {
			setTicket("");
			setError(t("授权已过期，请重新微信登录", "Authorization expired; sign in with WeChat again"));
			return;
		}
		if (!phoneCode) return;
		signingIn.current = true;
		setBusy(true);
		setError("");
		try {
			await finish(
				await api.wechatMiniPhone({
					ticket,
					phoneCode,
					device: deviceInfo(),
					...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
				}),
			);
		} catch (e) {
			setTicket("");
			setError(wechatError(e));
		} finally {
			signingIn.current = false;
			setBusy(false);
		}
	};
	const saveProfile = async () => {
		if (busy) return;
		setBusy(true);
		setError("");
		try {
			if (avatar) await uploadAvatar(avatar);
			if (nickname.trim()) {
				await api.updateMe({ displayName: nickname.trim() });
				await refreshMe();
			}
			await Taro.reLaunch({ url: next });
		} catch {
			setError(authFailure("profile"));
		} finally {
			setBusy(false);
		}
	};
	const capsule = process.env.TARO_ENV === "h5" ? null : Taro.getMenuButtonBoundingClientRect();
	if (status === "booting" || status === "restore-unavailable")
		return (
			<View style={capsule ? { paddingTop: `${Math.max(0, capsule.bottom)}px` } : undefined}>
				<SessionRestoreState loading={status === "booting"} />
			</View>
		);
	return (
		<View
			className={capsule ? "mini-auth-native" : ""}
			style={capsule ? ({ "--safe-area-top": `${Math.max(0, capsule.bottom)}px` } as CSSProperties) : undefined}
		>
			<AuthFrame
				as={AuthView}
				locale={
					<NativeButton className="mini-auth-locale" onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}>
						{locale === "zh-CN" ? "English" : "中文"}
					</NativeButton>
				}
				brand={
					<>
						<Image className="mini-auth-brand-logo mini-auth-logo-light" src={logo} />
						<Image className="mini-auth-brand-logo mini-auth-logo-dark" src={darkLogo} />
						<Text>Yonder</Text>
					</>
				}
			>
				<AuthStack as={AuthView}>
					<AuthTitle as={AuthView}>
						{entry === "profile"
							? t("完善资料", "Complete your profile")
							: mode === "reset" && entry === "phone"
								? t("重置密码", "Reset password")
								: t("登录 Yonder", "Sign in to Yonder")}
					</AuthTitle>
					{privacy ? (
						<>
							<Text>
								{t("请阅读并同意微信隐私保护指引后继续", "Review and agree to the WeChat privacy notice to continue")}
							</Text>
							<Text className="mini-auth-link" onClick={() => Taro.openPrivacyContract()}>
								{t("查看隐私保护指引", "View privacy notice")}
							</Text>
							<NativeButton
								className="auth-primary mini-auth-button"
								openType="agreePrivacyAuthorization"
								onAgreePrivacyAuthorization={() => {
									setPrivacy(false);
									void wechat();
								}}
							>
								{t("同意并继续", "Agree and continue")}
							</NativeButton>
							<Text className="mini-auth-link" onClick={() => setPrivacy(false)}>
								{t("取消", "Cancel")}
							</Text>
						</>
					) : entry === "profile" ? (
						<>
							<NativeButton
								className="auth-primary mini-auth-button"
								openType="chooseAvatar"
								onChooseAvatar={(e) => setAvatar(e.detail.avatarUrl)}
							>
								{avatar ? t("已选择头像", "Avatar selected") : t("选择微信头像", "Choose WeChat avatar")}
							</NativeButton>
							<Input
								className="mini-auth-input"
								type="nickname"
								value={nickname}
								placeholder={t("昵称", "Display name")}
								onInput={(e) => setNickname(e.detail.value)}
							/>
							<NativeButton
								className={`auth-primary mini-auth-button ${busy ? "is-busy" : ""}`}
								disabled={busy || undefined}
								loading={busy || undefined}
								onClick={() => void saveProfile()}
							>
								{t("保存并继续", "Save and continue")}
							</NativeButton>
							{error && <Text className="mini-auth-error">{error}</Text>}
							<Text className="mini-auth-link" onClick={() => void Taro.reLaunch({ url: next })}>
								{t("稍后完善", "Skip for now")}
							</Text>
						</>
					) : (
						<>
							{entry === "phone" && (
								<>
									<View>
										<Text className="mini-auth-label">{t("手机号", "Phone number")}</Text>
										<View className="auth-control mini-auth-phone">
											<Picker
												mode="selector"
												range={countries}
												value={country}
												disabled={phoneStage}
												onChange={(e) => setCountry(Number(e.detail.value))}
											>
												<Text>{countries[country]} ▾</Text>
											</Picker>
											<View className="mini-auth-phone-divider" />
											<Input
												className="mini-auth-phone-input"
												type="text"
												value={phone}
												disabled={phoneStage}
												onInput={(e) => setPhone(e.detail.value)}
											/>
										</View>
									</View>
									{phoneStage && (
										<Text
											className="mini-auth-link"
											onClick={() => {
												setPhoneStage(false);
												setCode("");
											}}
										>
											{t("修改手机号", "Change phone number")}
										</Text>
									)}
									{mode !== "password" && (phoneStage || mode === "reset") && (
										<View>
											<Text className="mini-auth-label">{t("验证码", "Verification code")}</Text>
											<View className="row">
												<Input
													className="auth-control mini-auth-input"
													type="number"
													maxlength={6}
													value={code}
													placeholder={t("6位验证码", "6-digit code")}
													onInput={(e) => setCode(e.detail.value)}
												/>
												<Button secondary loading={sending} disabled={seconds > 0 || busy} onClick={() => void send()}>
													{seconds ? `${seconds}s` : t("重新发送", "Resend")}
												</Button>
											</View>
										</View>
									)}

									{mode !== "code" && (
										<Field
											label={mode === "reset" ? t("新密码", "New password") : t("密码", "Password")}
											value={password}
											onInput={setPassword}
											password
										/>
									)}
								</>
							)}
							<AuthConsent as={AuthView}>
								<Consent agree={agree} onChange={setAgree} />
							</AuthConsent>
							{error && <Text className="mini-auth-error">{error}</Text>}
							<AuthActions as={AuthView}>
								{entry === "wechat" ? (
									ticket ? (
										<NativeButton
											className={`auth-primary mini-auth-button ${busy ? "is-busy" : ""}`}
											openType={agree && !busy ? "getPhoneNumber" : undefined}
											disabled={busy || undefined}
											loading={busy || undefined}
											onGetPhoneNumber={(e) => void phoneAuth(e.detail.code)}
											onClick={() => {
												if (!agree) setError(t("请先同意协议", "Please agree to the terms"));
											}}
										>
											{t("授权手机号", "Authorize phone number")}
										</NativeButton>
									) : (
										<NativeButton
											className={`auth-primary mini-auth-button ${busy ? "is-busy" : ""}`}
											disabled={busy || undefined}
											loading={busy || undefined}
											onClick={() => void wechat()}
										>
											{t("微信登录", "Sign in with WeChat")}
										</NativeButton>
									)
								) : (
									<NativeButton
										className={`auth-primary mini-auth-button ${busy || sending || (mode === "code" && !phoneStage && seconds > 0) ? "is-busy" : ""}`}
										disabled={busy || sending || (mode === "code" && !phoneStage && seconds > 0) || undefined}
										loading={process.env.TARO_ENV === "h5" ? undefined : busy || sending || undefined}
										onClick={() => void (mode === "code" && !phoneStage ? send() : submit())}
									>
										<View
											className={`mini-auth-button-label ${process.env.TARO_ENV === "h5" && (busy || sending) ? "is-loading" : ""}`}
										>
											<Text className="mini-auth-button-text">
												{mode === "reset"
													? t("重置密码", "Reset password")
													: mode === "code" && !phoneStage
														? seconds
															? `${seconds}s`
															: t("获取验证码", "Send code")
														: t("登录", "Sign in")}
											</Text>
											<View className="mini-auth-spinner" ariaHidden />
										</View>
									</NativeButton>
								)}
							</AuthActions>
							<View className="mini-auth-switches">
								<Text
									className="mini-auth-link"
									onClick={() => {
										setEntry(entry === "wechat" ? "phone" : "wechat");
										setError("");
									}}
								>
									{entry === "wechat" ? t("使用手机号登录", "Use phone number") : t("使用微信登录", "Use WeChat")}
								</Text>
								{entry === "phone" && (
									<Text
										className="mini-auth-link"
										onClick={() => {
											setMode(mode === "code" ? "password" : "code");
											setPhoneStage(false);
											setError("");
										}}
									>
										{mode === "code" ? t("使用密码登录", "Use password") : t("使用验证码登录", "Use verification code")}
									</Text>
								)}
							</View>
							{entry === "phone" && mode === "password" && (
								<Text
									className="mini-auth-link"
									onClick={() => {
										setMode("reset");
										setError("");
									}}
								>
									{t("忘记密码？", "Forgot password?")}
								</Text>
							)}
						</>
					)}
				</AuthStack>
			</AuthFrame>
		</View>
	);
}
