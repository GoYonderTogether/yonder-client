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

test("the camera requests only video, timestamps a single JPEG at shutter time, and stops only its stream", async () => {
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
	const view = render(
		<I18nextProvider i18n={i18n}>
			<MeetingCamera elapsedMs={1234} onClose={onClose} onPhoto={onPhoto} />
		</I18nextProvider>,
	);
	const shutter = screen.getByRole("button", { name: "Take photo" });
	await waitFor(() => expect(shutter).toBeEnabled());
	expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: "environment" } } });
	expect(screen.queryByRole("button", { name: "Switch camera" })).not.toBeInTheDocument();
	expect(screen.queryByRole("slider", { name: "Camera zoom" })).not.toBeInTheDocument();
	fireEvent.click(shutter);
	await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	expect(onPhoto).toHaveBeenCalledWith(expect.any(Promise), 1234);
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
			<MeetingCamera elapsedMs={0} onClose={onClose} onPhoto={onPhoto} />
		</I18nextProvider>,
	);
	expect(await screen.findByText("Camera access is off. Your audio recording is still running.")).toBeVisible();
	expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	expect(onClose).toHaveBeenCalledOnce();
	expect(onPhoto).not.toHaveBeenCalled();
});
