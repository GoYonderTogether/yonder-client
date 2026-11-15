import { expect, test } from "vitest";
import { parseAndroidManifest } from "./drivers.ts";
import { compareVersions } from "./version.ts";

const release = {
	version: "0.3.26111502",
	versionCode: 26111502,
	url: "https://dl.zethai.cn/android/0.3.26111502/yonder.apk",
	sha256: "a".repeat(64),
	minSupportedVersion: "0.3.26111401",
};

test("compares SemVer numerically and follows prerelease precedence", () => {
	expect(compareVersions("0.3.10", "0.3.9")).toBeGreaterThan(0);
	expect(compareVersions("1.0.0-rc.10", "1.0.0-rc.2")).toBeGreaterThan(0);
	expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
	expect(compareVersions("1.0.0+one", "1.0.0+two")).toBe(0);
	expect(() => compareVersions("1.02.0", "1.2.0")).toThrow();
	expect(() => compareVersions("1.2.0-01", "1.2.0")).toThrow();
});

test("rejects malformed or unsafe Android release manifests", () => {
	expect(parseAndroidManifest(release)).toEqual(release);
	const { minSupportedVersion: _minimum, ...withoutMinimum } = release;
	expect(parseAndroidManifest({ ...release, minSupportedVersion: null })).toEqual(withoutMinimum);
	for (const bad of [
		{ ...release, versionCode: "26111502" },
		{ ...release, sha256: "fake" },
		{ ...release, url: "http://dl.zethai.cn/a.apk" },
		{ ...release, url: "https://elsewhere.test/a.apk" },
		{ ...release, minSupportedVersion: "broken" },
	])
		expect(() => parseAndroidManifest(bad)).toThrow();
});
