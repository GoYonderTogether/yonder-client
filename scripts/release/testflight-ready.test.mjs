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

	const run = (automatic, state) => {
		const fixture = `
			import assert from "node:assert/strict";
			const group = { type: "betaGroups", id: "internal", attributes: { name: "Internal", isInternalGroup: true, hasAccessToAllBuilds: ${automatic} } };
			const external = { type: "betaGroups", id: "external", attributes: { isInternalGroup: false } };
			let assigned = false;
			globalThis.fetch = async (url, init) => {
				const { pathname, searchParams } = new URL(url);
				switch (pathname) {
					case "/v1/apps": return Response.json({ data: [{ id: "app" }] });
					case "/v1/builds":
						assert.equal(searchParams.get("include"), "betaGroups");
						assert.equal(searchParams.get("filter[version]"), "26112604");
						return Response.json({ data: [{ id: "build", attributes: { processingState: "VALID", usesNonExemptEncryption: false } }], included: assigned ? [external, group] : [external] });
					case "/v1/betaGroups": return Response.json({ data: [group, external] });
					case "/v1/builds/build/relationships/betaGroups":
						assert.equal(init.method, "POST");
						assert.equal(group.attributes.hasAccessToAllBuilds, false);
						assert.deepEqual(JSON.parse(init.body), { data: [{ type: "betaGroups", id: "internal" }] });
						assigned = true;
						return new Response(null, { status: 204 });
					case "/v1/builds/build/buildBetaDetail":
						assert.ok(assigned || group.attributes.hasAccessToAllBuilds);
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
					BUILD_NUMBER: "26112604",
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
});
