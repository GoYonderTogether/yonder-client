/**
 * Sign-in with a phone number and a six-digit code. One call both signs in and creates the
 * account: the interface never asks "do you have an account?" (11-布局和页面层级 第七节).
 */
import type { MeResponse } from "../member/member.ts";

export type PhoneChannel = "sms";

export interface SendCodeRequest {
	channel: PhoneChannel;
	/** E.164 with the leading `+`, e.g. `+8613800138000`. */
	target: string;
	purpose: "sign_in" | "sign_up" | "reset_password";
}

export interface SendCodeResponse {
	sent: true;
	/** Seconds until the code stops being accepted. */
	expiresIn: number;
	/** Seconds until another code may be requested. */
	retryAfter: number;
	maskedTarget: string;
}

export interface SignInRequest {
	channel: PhoneChannel;
	target: string;
	code: string;
	inviteCode?: string;
	device?: DeviceInfo;
	/** Must be `true`; the checkbox is never pre-ticked (01-产品功能和页面 第 5.3 节). */
	agreeTerms: true;
}

export interface DeviceInfo {
	name: string;
	platform: "web" | "macos" | "windows" | "ios" | "android" | "linux";
	appVersion: string;
}

/**
 * What a successful sign-in answers. The refresh token is not here on web — it is set as an
 * httpOnly cookie. On a shell that stores it in the keychain, the same body carries it.
 */
export interface SignInResponse {
	accessToken: string;
	refreshToken?: string;
	expiresIn: number;
	/** True when this sign-in created the account, which is what makes the setup steps show. */
	isNewAccount: boolean;
	me: MeResponse;
	invite: { applied: boolean; invitedBy?: { handle: string; displayName: string } };
}

/** Password sign-in: the second way in, once a password has been set. */
export interface PasswordSignInRequest {
	channel: PhoneChannel;
	target: string;
	password: string;
	device?: DeviceInfo;
}

export interface PasswordSignInResponse extends Omit<SignInResponse, "isNewAccount" | "invite"> {
	isNewAccount: false;
}

/** `POST /v1/auth/password`. Setting the first password and changing one both come here. */
export interface SetPasswordRequest {
	/** Required when a password already exists; omitted when setting the first one. */
	currentPassword?: string;
	/** Required when the user forgot it and proved the phone with a code instead. */
	code?: string;
	newPassword: string;
}

/**
 * `POST /v1/auth/reset-password` — the forgotten-password path: a code for the number is the proof,
 * so no session is needed. Every other session is revoked once it succeeds.
 */
export interface ResetPasswordRequest {
	channel: PhoneChannel;
	target: string;
	code: string;
	newPassword: string;
}

/** `POST /v1/auth/refresh` answers a new access token and rotates the refresh token. */
export interface RefreshResponse {
	accessToken: string;
	refreshToken?: string;
	expiresIn: number;
}

/** `DELETE /v1/me` — account deletion, a store requirement. */
export interface DeleteAccountRequest {
	/** Typed by the user; must equal their handle. */
	confirmHandle: string;
	reason?: string;
}

export interface DeleteAccountResponse {
	scheduledFor: string;
	cancellableUntil: string;
}
