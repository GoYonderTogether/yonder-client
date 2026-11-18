import type {
	PasswordSignInResponse,
	RefreshResponse,
	ResetPasswordRequest,
	ResolveInviteResponse,
	SendCodeRequest,
	SendCodeResponse,
	SignInRequest,
	SignInResponse,
	WechatMiniPhoneRequest,
	WechatMiniSignInRequest,
	WechatMiniSignInResponse,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** Sign-in, refresh and the calls that work before an account is known. */
export function authEndpoints(client: ApiClient) {
	return {
		sendCode(body: SendCodeRequest): Promise<SendCodeResponse> {
			return client.request("/v1/auth/code", { body, authenticated: false });
		},

		wechatMiniSignIn(body: WechatMiniSignInRequest): Promise<WechatMiniSignInResponse> {
			return client.request("/v1/auth/wechat/mini/sign-in", { body, authenticated: false });
		},

		wechatMiniPhone(body: WechatMiniPhoneRequest): Promise<SignInResponse> {
			return client.request("/v1/auth/wechat/mini/phone", { body, authenticated: false });
		},

		signIn(body: SignInRequest): Promise<SignInResponse> {
			return client.request("/v1/auth/sign-in", { body, authenticated: false });
		},

		signInWithPassword(body: {
			target: string;
			password: string;
			device?: SignInRequest["device"];
		}): Promise<PasswordSignInResponse> {
			return client.request("/v1/auth/password", { body, authenticated: false });
		},

		refresh(body: { refreshToken?: string }): Promise<RefreshResponse> {
			return client.request("/v1/auth/refresh", { body, authenticated: false });
		},

		resetPasswordWithCode(body: ResetPasswordRequest): Promise<{ ok: true }> {
			return client.request("/v1/auth/reset-password", { body, authenticated: false });
		},

		signOut(body: { allDevices?: boolean } = {}): Promise<{ ok: true }> {
			return client.request("/v1/auth/sign-out", { body });
		},

		health(): Promise<{ ok: true; version: string; time: string; sms: string }> {
			return client.request("/v1/health", { authenticated: false });
		},

		resolveInvite(code: string): Promise<ResolveInviteResponse> {
			return client.request("/v1/invite/resolve", { body: { code }, authenticated: false });
		},
	};
}
