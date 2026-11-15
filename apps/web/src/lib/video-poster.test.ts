// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { createVideoPoster } from "./video-poster.ts";

afterEach(() => vi.restoreAllMocks());
function media() {
	const video = document.createElement("video");
	const canvas = document.createElement("canvas");
	const drawImage = vi.fn();
	const originalCreate = document.createElement.bind(document);
	vi.spyOn(document, "createElement").mockImplementation(((name: string) =>
		name === "video" ? video : name === "canvas" ? canvas : originalCreate(name)) as typeof document.createElement);
	vi.spyOn(video, "pause").mockImplementation(() => {});
	vi.spyOn(video, "load").mockImplementation(() => {});
	Object.defineProperties(video, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 } });
	vi.spyOn(canvas, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
	const dimensions: number[][] = [];
	vi.spyOn(canvas, "toBlob").mockImplementation((callback) => {
		dimensions.push([canvas.width, canvas.height]);
		callback(new Blob(["poster"], { type: "image/jpeg" }));
	});
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-video");
	const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	return { video, canvas, drawImage, revoke, dimensions };
}

test("an existing Blob becomes a bounded first-frame poster and releases decoder resources", async () => {
	const { video, canvas, drawImage, revoke, dimensions } = media();
	const result = createVideoPoster(new Blob(["video"], { type: "video/mp4" }));
	video.dispatchEvent(new Event("loadeddata"));
	expect((await result).type).toBe("image/jpeg");
	expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 180);
	expect(dimensions).toEqual([[320, 180]]);
	expect(canvas.width).toBe(1);
	expect(video.hasAttribute("src")).toBe(false);
	expect(revoke).toHaveBeenCalledWith("blob:local-video");
});

test("leaving a draft aborts frame work and clears the offscreen video", async () => {
	const { video, revoke } = media();
	const controller = new AbortController();
	const result = createVideoPoster(new Blob(["video"]), controller.signal);
	controller.abort();
	await expect(result).rejects.toMatchObject({ name: "AbortError" });
	expect(video.hasAttribute("src")).toBe(false);
	expect(revoke).toHaveBeenCalledOnce();
	expect(video.onloadeddata).toBeNull();
});

test("an unsupported codec rejects so the card can retain its video icon", async () => {
	const { video, revoke } = media();
	const result = createVideoPoster(new Blob(["broken"]));
	video.dispatchEvent(new Event("error"));
	await expect(result).rejects.toThrow("video_poster_unsupported");
	expect(revoke).toHaveBeenCalledOnce();
});
