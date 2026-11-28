import { expect, test } from "vitest";
import { readUpdateOffer, trustedTestFlightUrl } from "./update-offer.ts";

const candidate = { id: "release-99", version: "0.3.99", channel: "stable", platform: "web" };

test("update offers are platform/channel scoped and cannot reload older or untrusted URLs", () => {
	expect(
		readUpdateOffer({ release: { ...candidate, url: "https://invalid.example" } }, "web", "stable", "0.3.98"),
	).toEqual(candidate);
	expect(readUpdateOffer({ release: candidate }, "android", "stable", "0.3.98")).toBeNull();
	expect(readUpdateOffer({ release: candidate }, "web", "stable", "0.3.99")).toBeNull();
	expect(readUpdateOffer({ release: candidate }, "web", "testflight-internal", "0.3.98")).toBeNull();
	expect(readUpdateOffer({ release: null }, "web", "stable", "0.3.98")).toBeNull();
});

test("TestFlight accepts only an exact HTTPS Apple invitation approved by the server", () => {
	const url = "https://testflight.apple.com/join/AbcD1234";
	expect(trustedTestFlightUrl(url)).toBe(url);
	for (const bad of [
		"http://testflight.apple.com/join/AbcD1234",
		"https://testflight.apple.com.example.com/join/AbcD1234",
		"https://testflight.apple.com@evil.example/join/AbcD1234",
		"https://testflight.apple.com/join/AbcD1234?redirect=1",
		"https://testflight.apple.com/join/AbcD1234/extra",
	])
		expect(trustedTestFlightUrl(bad)).toBeUndefined();
	const ios = { ...candidate, platform: "ios", channel: "testflight-internal" };
	expect(readUpdateOffer({ release: ios }, "ios", "testflight-internal", "0.3.98")).toBeNull();
	expect(readUpdateOffer({ release: { ...ios, url } }, "ios", "testflight-internal", "0.3.98")).toEqual({
		...ios,
		url,
	});
});

test("only an installed beta can be offered an older stable Web or desktop build", () => {
	const release = { ...candidate, version: "0.3.97" };
	expect(readUpdateOffer({ release }, "web", "beta", "0.3.98", "beta")).toEqual(release);
	expect(readUpdateOffer({ release }, "web", "beta", "0.3.98")).toBeNull();
	const android = { ...release, platform: "android" };
	expect(readUpdateOffer({ release: android }, "android", "stable", "0.3.98", "beta")).toBeNull();
});
