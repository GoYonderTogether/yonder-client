import type {
	ChangeHandleResponse,
	ChangePhoneRequest,
	DeleteAccountRequest,
	DeleteAccountResponse,
	DeviceInfo,
	DeviceListResponse,
	Goal,
	GoalChange,
	InviteResponse,
	MeResponse,
	OnboardingStep,
	PhoneChangeCodeRequest,
	PushTokenRegistration,
	SendCodeResponse,
	SetPasswordRequest,
	UpdateDeviceRemarkRequest,
	UpdateMeRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export interface SessionSummary {
	id: string;
	deviceId: string | null;
	deviceName: string;
	platform: string;
	appVersion: string;
	lastSeenAt: string;
	createdAt: string;
	current: boolean;
}

/** The signed-in account: profile, credentials, sessions, devices and deletion. */
export function accountEndpoints(client: ApiClient) {
	return {
		me(): Promise<MeResponse> {
			return client.request("/v1/me");
		},

		completeOnboarding(skippedSteps: OnboardingStep[] = []): Promise<{ conversationId: string }> {
			return client.request("/v1/me/onboarding/complete", { body: { skippedSteps } });
		},

		goals(): Promise<{ items: Goal[]; onboarding: { version: number; disabled: boolean } }> {
			return client.request("/v1/goals");
		},

		changeGoal(id: string, body: GoalChange): Promise<Goal> {
			return client.request(`/v1/goals/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},

		transferGoal(id: string, botId: string): Promise<Goal> {
			return client.request(`/v1/goals/${encodeURIComponent(id)}/transfer`, { body: { botId } });
		},

		disableOnboarding(): Promise<{ ok: true }> {
			return client.request("/v1/me/onboarding/disable", { method: "POST" });
		},

		invite(): Promise<InviteResponse> {
			return client.request("/v1/invite");
		},

		updateMe(body: UpdateMeRequest): Promise<MeResponse> {
			return client.request("/v1/me", { method: "PATCH", body });
		},

		uploadAvatar(file: Blob): Promise<MeResponse> {
			return client.request("/v1/me/avatar", {
				raw: { bytes: file, contentType: file.type || "application/octet-stream" },
			});
		},

		setPassword(body: SetPasswordRequest): Promise<{ ok: true }> {
			return client.request("/v1/me/password", { body });
		},

		changeHandle(handle: string): Promise<ChangeHandleResponse> {
			return client.request("/v1/me/handle", { body: { handle } });
		},

		/** Without `target` the code goes to the number the account has now; with it, to the new one. */
		sendPhoneChangeCode(body: PhoneChangeCodeRequest): Promise<SendCodeResponse> {
			return client.request("/v1/me/phone/code", { body });
		},

		changePhone(body: ChangePhoneRequest): Promise<MeResponse> {
			return client.request("/v1/me/phone", { body });
		},

		sessions(): Promise<{ items: SessionSummary[] }> {
			return client.request("/v1/me/sessions");
		},

		devices(): Promise<DeviceListResponse> {
			return client.request("/v1/devices");
		},

		updateDeviceRemark(deviceId: string, body: UpdateDeviceRemarkRequest): Promise<{ ok: true }> {
			return client.request(`/v1/devices/${encodeURIComponent(deviceId)}`, { method: "PATCH", body });
		},

		registerDevice(body: DeviceInfo & { installationId: string }): Promise<{ ok: true }> {
			return client.request("/v1/devices/register", { body });
		},

		registerPushToken(body: PushTokenRegistration): Promise<{ ok: true }> {
			return client.request("/v1/devices/push-token", { method: "PUT", body });
		},

		unregisterPushToken(): Promise<{ ok: true }> {
			return client.request("/v1/devices/push-token", { method: "DELETE" });
		},

		revokeSession(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
		},

		/** Step one: a code to the account's own number. */
		sendDeleteAccountCode(): Promise<SendCodeResponse> {
			return client.request("/v1/me/delete/code", { body: {} });
		},

		/** Step two: the code and the handle. The account then waits seven days; nothing is erased. */
		deleteAccount(body: DeleteAccountRequest): Promise<DeleteAccountResponse> {
			return client.request("/v1/me", { method: "DELETE", body });
		},
	};
}
