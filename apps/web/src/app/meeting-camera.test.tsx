// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, test, vi } from "vitest";
import { MeetingCamera } from "./meeting-camera.tsx";

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
	if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
	else Reflect.deleteProperty(navigator, "mediaDevices");
	vi.restoreAllMocks();
});

const i18n = createI18n("en");

test("the camera requests only video, timestamps consecutive JPEGs, enforces the cap, and stops only its stream", async () => {
	const stop = vi.fn();
	const camera = {
		stop,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		getSettings: () => ({ deviceId: "only-camera" }),
		getCapabilities: () => ({}),
	};
	const getUserMedia = vi.fn(async () => ({
		getTracks: () => [camera],
		getVideoTracks: () => [camera],
	}));
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia, enumerateDevices: async () => [{ kind: "videoinput", deviceId: "only-camera" }] },
	});
	vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
	vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(320);
	vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(240);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: vi.fn(),
	} as unknown as CanvasRenderingContext2D);
	const jpeg = new Blob(["photo frame"], { type: "image/jpeg" });
	vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(jpeg));
	const onPhoto = vi.fn(async (image: Promise<Blob>) => expect(await image).toBe(jpeg));
	const onClose = vi.fn();
	const panel = (elapsedMs: number, photoLimitReached = false) => (
		<I18nextProvider i18n={i18n}>
			<MeetingCamera elapsedMs={elapsedMs} photoLimitReached={photoLimitReached} onClose={onClose} onPhoto={onPhoto} />
		</I18nextProvider>
	);
	const view = render(panel(1234));
	const shutter = screen.getByRole("button", { name: "Take photo" });
	await waitFor(() => expect(shutter).toBeEnabled());
	expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: "environment" } } });
	expect(screen.queryByRole("button", { name: "Switch camera" })).not.toBeInTheDocument();
	expect(screen.queryByRole("slider", { name: "Camera zoom" })).not.toBeInTheDocument();
	fireEvent.click(shutter);
	await waitFor(() => expect(shutter).toBeEnabled());
	expect(onPhoto).toHaveBeenNthCalledWith(1, expect.any(Promise), 1234);
	view.rerender(panel(2456));
	fireEvent.click(shutter);
	await waitFor(() => expect(shutter).toBeEnabled());
	expect(onPhoto).toHaveBeenNthCalledWith(2, expect.any(Promise), 2456);
	expect(getUserMedia).toHaveBeenCalledOnce();
	expect(onClose).not.toHaveBeenCalled();
	expect(stop).not.toHaveBeenCalled();
	view.rerender(panel(3000, true));
	expect(shutter).toBeDisabled();
	fireEvent.click(shutter);
	expect(onPhoto).toHaveBeenCalledTimes(2);
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	expect(onClose).toHaveBeenCalledOnce();
	view.unmount();
	expect(stop).toHaveBeenCalledOnce();
});

test("denied camera access leaves an honest closeable fallback without taking photos", async () => {
	const getUserMedia = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
	Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
	const onPhoto = vi.fn();
	const onClose = vi.fn();
	render(
		<I18nextProvider i18n={i18n}>
			<MeetingCamera elapsedMs={0} photoLimitReached={false} onClose={onClose} onPhoto={onPhoto} />
		</I18nextProvider>,
	);
	expect(await screen.findByText("Camera access is off. Your audio recording is still running.")).toBeVisible();
	expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	expect(onClose).toHaveBeenCalledOnce();
	expect(onPhoto).not.toHaveBeenCalled();
});
