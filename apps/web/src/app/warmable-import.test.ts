import { expect, test, vi } from "vitest";
import { warmableImport } from "./warmable-import.ts";

test("shares concurrent reads and does not keep a failed warmup", async () => {
	const load = vi.fn<() => Promise<string>>();
	load.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("page");
	const read = warmableImport(load);

	const warmed = read();
	expect(read()).toBe(warmed);
	await expect(warmed).rejects.toThrow("offline");
	await expect(read()).resolves.toBe("page");
	await expect(read()).resolves.toBe("page");
	expect(load).toHaveBeenCalledTimes(2);
});
