import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("TestFlight gives eligible builds to the internal group and checks Apple's actual state", (t) => {
	const dir = mkdtempSync(join(tmpdir(), "yonder-testflight-api-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const key = join(dir, "test.pem");
	writeFileSync(
		key,
		generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }),
	);

	const run = (
		automatic,
		state,
		{ groupName = "", otherName, existing = [], inputBuild = "26112604", returnedBuild = "26112604" } = {},
	) => {
		const fixture = `
			import assert from "node:assert/strict";
			const group = { type: "betaGroups", id: "internal", attributes: { name: "Internal", isInternalGroup: true, hasAccessToAllBuilds: ${automatic} } };
			const external = { type: "betaGroups", id: "external", attributes: { name: "External", isInternalGroup: false } };
			const other = { type: "betaGroups", id: "other", attributes: { name: ${JSON.stringify(otherName)}, isInternalGroup: true } };
			const attached = new Set(${JSON.stringify(existing)});
			globalThis.fetch = async (url, init) => {
				const { pathname, searchParams } = new URL(url);
				switch (pathname) {
					case "/v1/apps": return Response.json({ data: [{ id: "app" }] });
					case "/v1/builds":
						assert.equal(searchParams.get("include"), "betaGroups");
						assert.equal(searchParams.get("filter[version]"), "26112604");
						return Response.json({ data: [{ id: "build", attributes: { version: ${JSON.stringify(returnedBuild)}, processingState: "VALID", usesNonExemptEncryption: false } }], included: [external, other, group].filter(({ id }) => id === "external" || attached.has(id)) });
					case "/v1/betaGroups": return Response.json({ data: other.attributes.name ? [other, group, external] : [group, external] });
					case "/v1/builds/build/relationships/betaGroups":
						assert.equal(init.method, "POST");
						assert.equal(group.attributes.hasAccessToAllBuilds, false);
						assert.equal(attached.has("internal"), false);
						assert.ok(!process.env.INTERNAL_GROUP_NAME || (process.env.INTERNAL_GROUP_NAME === "Internal" && other.attributes.name !== "Internal"));
						assert.deepEqual(JSON.parse(init.body), { data: [{ type: "betaGroups", id: "internal" }] });
						attached.add("internal");
						return new Response(null, { status: 204 });
					case "/v1/builds/build/buildBetaDetail":
						assert.ok(attached.has("internal") || group.attributes.hasAccessToAllBuilds);
						return Response.json({ data: { attributes: { internalBuildState: ${JSON.stringify(state)} } } });
					default: throw new Error("Unexpected ASC endpoint " + pathname);
				}
			};
		`;
		return spawnSync(
			process.execPath,
			[
				"--import",
				`data:text/javascript,${encodeURIComponent(fixture)}`,
				fileURLToPath(new URL("./testflight-ready.mjs", import.meta.url)),
			],
			{
				encoding: "utf8",
				timeout: 5_000,
				env: {
					KEY_ID: "test",
					ISSUER_ID: "test",
					KEY_PATH: key,
					BUNDLE_ID: "net.yonderbot.app",
					BUILD_NUMBER: inputBuild,
					INTERNAL_GROUP_NAME: groupName,
				},
			},
		);
	};

	for (const automatic of [false, true]) {
		const result = run(automatic, "IN_BETA_TESTING");
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /testable in Internal \(internal=IN_BETA_TESTING\)/);
	}
	const blocked = run(true, "IN_EXPORT_COMPLIANCE_REVIEW");
	assert.equal(blocked.status, 1);
	assert.match(blocked.stderr, /cannot start internal testing: IN_EXPORT_COMPLIANCE_REVIEW/);

	const named = run(false, "IN_BETA_TESTING", { groupName: "Internal", otherName: "Different", existing: ["other"] });
	assert.equal(named.status, 0, named.stderr);
	assert.match(named.stdout, /assigned build 26112604 to internal group Internal/);
	assert.match(named.stdout, /testable in Internal/);

	const alreadyAssigned = run(false, "IN_BETA_TESTING", {
		groupName: "Internal",
		otherName: "Different",
		existing: ["other", "internal"],
	});
	assert.equal(alreadyAssigned.status, 0, alreadyAssigned.stderr);
	assert.doesNotMatch(alreadyAssigned.stdout, /assigned build/);

	for (const [groupName, otherName] of [
		["Internal", "Internal"],
		["internal", "Different"],
		["External", "Different"],
	]) {
		const invalid = run(false, "IN_BETA_TESTING", { groupName, otherName, existing: ["other"] });
		assert.equal(invalid.status, 1);
		assert.match(invalid.stderr, /expected one exact internal TestFlight group/);
	}

	const ambiguous = run(false, "IN_BETA_TESTING", { otherName: "Different" });
	assert.equal(ambiguous.status, 1);
	assert.match(ambiguous.stderr, /app has 2 internal TestFlight groups; expected exactly one/);

	const malformed = run(false, "IN_BETA_TESTING", { groupName: "Internal", inputBuild: "26112604&limit=20" });
	assert.equal(malformed.status, 1);
	assert.match(malformed.stderr, /Expected an exact CFBundleVersion/);

	const wrongBuild = run(false, "IN_BETA_TESTING", { groupName: "Internal", returnedBuild: "26112603" });
	assert.equal(wrongBuild.status, 1);
	assert.match(wrongBuild.stderr, /did not return exactly one iOS build with CFBundleVersion 26112604/);
});
