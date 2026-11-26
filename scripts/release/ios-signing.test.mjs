import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/ios-release.yml", import.meta.url), "utf8");
const statusWorkflow = readFileSync(new URL("../../.github/workflows/testflight-status.yml", import.meta.url), "utf8");
const team = "TESTTEAM42";
const bundle = "net.yonderbot.app";
const nextBundle = "net.yonderbot.ios";
const plist = (xml) => `<?xml version="1.0"?><plist version="1.0"><dict>${xml}</dict></plist>`;
const row = (key, value) => `<key>${key}</key><string>${value}</string>`;

function profile({
	name = "Distribution profile",
	aps = "production",
	profileTeam = team,
	app = bundle,
	expiry = "2050-01-01T00:00:00Z",
	extra = "",
	debug = false,
} = {}) {
	return Buffer.from(
		plist(
			row("Name", name) +
				`<key>ExpirationDate</key><date>${expiry}</date>` +
				`<key>TeamIdentifier</key><array><string>${profileTeam}</string></array>` +
				`<key>Entitlements</key><dict>${row("application-identifier", `${profileTeam}.${app}`)}` +
				row("com.apple.developer.team-identifier", profileTeam) +
				(aps ? row("aps-environment", aps) : "") +
				`<key>get-task-allow</key><${debug}/></dict>${extra}`,
		),
	).toString("base64");
}

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "yonder-testflight-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const run = join(root, "run");
	const bin = join(root, "bin");
	const home = join(root, "home");
	for (const path of [run, bin, home]) mkdirSync(path);
	const stub = (name, script) =>
		writeFileSync(join(bin, name), `#!/bin/bash\nset -eu\n${script}\n`, {
			mode: 0o700,
		});
	// Decode synthetic plist bytes only. No keychain, exporter, code signer, uploader, or secrets are used.
	stub("security", 'if [ "$1" = cms ]; then cat "$6"; fi');
	stub("xcodebuild", 'cp "$FAKE_IPA" dist-ios/exported.ipa');
	stub("codesign", 'cat "$5/fake-signed-entitlements.plist"');
	stub("xcrun", 'test "$1" = altool && echo uploaded > "$RUNNER_TEMP/uploaded"');
	stub("git", 'test "$1" = rev-parse && printf "%s\\n" "$HEAD_SHA"');
	const env = {
		PATH: `${bin}:/usr/bin:/bin`,
		HOME: home,
		RUNNER_TEMP: run,
		GITHUB_ENV: join(run, "env"),
		TEAM_ID: team,
		BUNDLE_ID: bundle,
		CERT_BASE64: Buffer.from("synthetic certificate placeholder").toString("base64"),
		CERT_PASSWORD: "synthetic password",
		IOS_PROFILE_NAME: "Synthetic selected profile",
		ARCHIVE: "isolated fixtures use a stub",
		MARKETING_VERSION: "0.3.26112399",
		BUILD_NUMBER: "26112399",
		INPUT_VERSION: "0.3.26112399",
		GITHUB_REF: "refs/heads/main",
		GITHUB_EVENT_NAME: "workflow_dispatch",
		HEAD_SHA: "a".repeat(40),
		EXPECTED_COMMIT: "a".repeat(40),
		KEY_BASE64: Buffer.from("synthetic upload key placeholder").toString("base64"),
		KEY_ID: "synthetic",
		ISSUER_ID: "synthetic",
		FAKE_IPA: join(root, "fixture.ipa"),
	};
	function step(name, overrides) {
		const start = workflow.indexOf(`      - name: ${name}\n`);
		assert.notEqual(start, -1);
		const yaml = workflow.slice(start).split("\n      - ")[0];
		const runAt = yaml.indexOf("        run: |\n");
		assert.notEqual(runAt, -1);
		const script = yaml
			.slice(runAt)
			.split("\n")
			.slice(1)
			.filter((line) => line.startsWith("          "))
			.map((line) => line.slice(10))
			.join("\n");
		assert.ok(script.includes("set -eu"));
		return spawnSync("/bin/bash", ["-e", "-c", script], {
			cwd: root,
			env: { ...env, ...overrides },
			encoding: "utf8",
		});
	}
	function ipa({
		marker = "production",
		aps = "production",
		app = bundle,
		signedTeam = team,
		version = env.MARKETING_VERSION,
		build = env.BUILD_NUMBER,
	} = {}) {
		const path = join(root, "Payload/Yonder.app");
		mkdirSync(path, { recursive: true });
		writeFileSync(
			join(path, "Info.plist"),
			plist(
				row("CFBundleIdentifier", app) +
					row("CFBundleShortVersionString", version) +
					row("CFBundleVersion", build) +
					row("YonderPushEnvironment", marker),
			),
		);
		writeFileSync(
			join(path, "fake-signed-entitlements.plist"),
			plist(
				row("application-identifier", `${signedTeam}.${app}`) +
					row("com.apple.developer.team-identifier", signedTeam) +
					(aps ? row("aps-environment", aps) : ""),
			),
		);
		execFileSync("/usr/bin/zip", ["-qr", env.FAKE_IPA, "Payload"], {
			cwd: root,
		});
	}
	return { step, ipa, env, run };
}

const mac = { skip: process.platform !== "darwin" };
const assertOk = (result) => assert.equal(result.status, 0, result.stdout + result.stderr);

test("both dispatch kinds pick a production App Store profile by eligibility and always turn APNs on", mac, (t) => {
	const cases = [
		{
			mode: "true",
			regular: profile({ name: "Regular push" }),
			internal: profile({ name: "Internal preferred push" }),
			picked: "Internal preferred push",
		},
		{
			mode: "false",
			regular: profile({ name: "Regular push" }),
			internal: profile({ name: "Internal push" }),
			picked: "Regular push",
		},
		{
			mode: "false",
			regular: profile({ aps: "" }),
			internal: profile({ name: "Same-app push fallback" }),
			picked: "Same-app push fallback",
		},
		{
			mode: "true",
			regular: profile({ name: "Regular push fallback" }),
			internal: profile({ expiry: "2000-01-01T00:00:00Z" }),
			picked: "Regular push fallback",
		},
	];
	for (const { mode, regular, internal, picked } of cases) {
		const { step, env } = fixture(t);
		assertOk(
			step("还原签名材料", {
				TESTFLIGHT_INTERNAL: mode,
				PROFILE_BASE64: regular,
				INTERNAL_PUSH_PROFILE_BASE64: internal,
			}),
		);
		assert.ok(readFileSync(env.GITHUB_ENV, "utf8").includes(`IOS_PROFILE_NAME=${picked}\nYONDER_IOS_PUSH=1\n`));
	}
});

test("wrong scope, APNs, expiry or distribution type all fail closed before signing or export", mac, (t) => {
	for (const rejected of [
		{ aps: "" },
		{ aps: "development" },
		{ app: "net.wrong.app" },
		{ profileTeam: "WRONGTEAM1" },
		{ expiry: "2000-01-01T00:00:00Z" },
		{ debug: true },
		{
			extra: "<key>ProvisionedDevices</key><array><string>test-device</string></array>",
		},
		{ extra: "<key>ProvisionsAllDevices</key><true/>" },
	]) {
		const { step } = fixture(t);
		const result = step("还原签名材料", {
			PROFILE_BASE64: profile(rejected),
		});
		assert.notEqual(result.status, 0);
		assert.match(result.stdout, /unexpired App Store profile with production APNs/);
	}
});

test("both export modes require the production marker and actual signature entitlement before upload", mac, (t) => {
	for (const internal of ["false", "true"]) {
		for (const [fixtureOptions, error] of [
			[{}, null],
			[{ marker: "sandbox" }, "YonderPushEnvironment"],
			[{ aps: "" }, "aps-environment"],
			[{ aps: "development" }, "aps-environment"],
			[{ signedTeam: "WRONGTEAM1" }, "application-identifier"],
			[{ version: "1.0.0" }, "CFBundleShortVersionString"],
			[{ build: "26112300" }, "CFBundleVersion"],
		]) {
			const { step, ipa, run } = fixture(t);
			ipa(fixtureOptions);
			const result = step("导出 IPA", { TESTFLIGHT_INTERNAL: internal });
			if (error) {
				assert.notEqual(result.status, 0);
				assert.ok(result.stdout.includes(error), result.stdout + result.stderr);
				continue;
			}
			assertOk(result);
			const opts = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", join(run, "ExportOptions.plist")], {
				encoding: "utf8",
			});
			assert.equal(JSON.parse(opts).testFlightInternalTestingOnly, internal === "true" ? true : undefined);
			assert.equal(JSON.parse(opts).manageAppVersionAndBuildNumber, false);
			assertOk(step("上传 TestFlight"));
			assert.equal(readFileSync(join(run, "uploaded"), "utf8"), "uploaded\n");
		}
	}
	// Failed validation in the export step must not be overridden or upload a GitHub asset via the internal lane.
	assert.doesNotMatch(workflow, /continue-on-error|if:.*always.*\n.*上传 TestFlight/);
	assert.match(
		workflow,
		/上传 GitHub Release 资产\n +if: \$\{\{ !inputs\.testflight_internal && github\.ref_type == 'tag' \}\}/,
	);
});

test(
	"dated test releases keep their version; a verified eligible build can specify App Store marketing version",
	mac,
	(t) => {
		const verify = "核对 tag → 提交并确定版本";
		const { step, env } = fixture(t);
		assertOk(step(verify, { RELEASE_TAG: "v0.3.26112399", GITHUB_REF: "refs/tags/v0.3.26112399" }));
		assert.match(readFileSync(env.GITHUB_ENV, "utf8"), /MARKETING_VERSION=0\.3\.26112399/);
		assertOk(step(verify, { INPUT_MARKETING_VERSION: "1.0.0" }));
		assert.match(
			readFileSync(env.GITHUB_ENV, "utf8"),
			/MARKETING_VERSION=1\.0\.0\nTAG=v0\.3\.26112399\nBUILD_NUMBER=26112399/,
		);
		const candidate = fixture(t);
		candidate.ipa({ version: "1.0.0" });
		assertOk(candidate.step("导出 IPA", { MARKETING_VERSION: "1.0.0" }));
		for (const invalid of [
			{ INPUT_MARKETING_VERSION: "1.0" },
			{ INPUT_MARKETING_VERSION: "1.0.0", TESTFLIGHT_INTERNAL: "true" },
			{ INPUT_MARKETING_VERSION: "1.0.0", EXPECTED_COMMIT: "" },
			{ INPUT_MARKETING_VERSION: "1.0.0", GITHUB_REF: "refs/tags/v0.3.26112399" },
		]) {
			assert.notEqual(step(verify, invalid).status, 0);
		}
	},
);

test("each iOS app selects its own credential names before reading secrets", () => {
	for (const suffix of [
		"DISTRIBUTION_CERT_P12_BASE64",
		"DISTRIBUTION_CERT_PASSWORD",
		"PROVISIONING_PROFILE_BASE64",
		"TEAM_ID",
	]) {
		assert.ok(workflow.includes(`secrets[inputs.ios_app == 'next' && 'IOS_NEXT_${suffix}' || 'IOS_${suffix}']`));
	}
	for (const suffix of ["KEY_ID", "ISSUER_ID", "PRIVATE_KEY_BASE64"]) {
		assert.ok(
			workflow.includes(`secrets[inputs.ios_app == 'next' && 'ASC_IOS_NEXT_API_${suffix}' || 'ASC_API_${suffix}']`),
		);
		assert.ok(
			statusWorkflow.includes(
				`secrets[inputs.bundle_id == '${nextBundle}' && 'ASC_IOS_NEXT_API_${suffix}' || 'ASC_API_${suffix}']`,
			),
		);
	}
	assert.ok(workflow.includes("inputs.ios_app != 'next' && secrets.IOS_TESTFLIGHT_PUSH_PROFILE_BASE64 || ''"));
});

test("the new iOS app uses a verified manual dispatch, scoped profile, and matching exported IPA", mac, (t) => {
	const verify = "核对 tag → 提交并确定版本";
	const next = { BUNDLE_ID: nextBundle, IOS_APP: "next" };
	const { step, env } = fixture(t);
	assertOk(step(verify, next));
	for (const override of [
		{ GITHUB_EVENT_NAME: "release" },
		{ GITHUB_REF: "refs/tags/v0.3.26112399" },
		{ TESTFLIGHT_INTERNAL: "true" },
		{ EXPECTED_COMMIT: "" },
	]) {
		assert.notEqual(step(verify, { ...next, ...override }).status, 0);
	}
	assert.notEqual(step("还原签名材料", { ...next, PROFILE_BASE64: profile() }).status, 0);
	assertOk(step("还原签名材料", { ...next, PROFILE_BASE64: profile({ app: nextBundle }) }));
	assert.match(readFileSync(env.GITHUB_ENV, "utf8"), /TEAM_ID=TESTTEAM42\nIOS_TEAM_ID=TESTTEAM42/);
	const good = fixture(t);
	good.ipa({ app: nextBundle });
	assertOk(good.step("导出 IPA", next));
	const exported = JSON.parse(
		execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", join(good.run, "ExportOptions.plist")], {
			encoding: "utf8",
		}),
	);
	assert.deepEqual(exported.provisioningProfiles, { [nextBundle]: env.IOS_PROFILE_NAME });
	const wrong = fixture(t);
	wrong.ipa();
	const rejected = wrong.step("导出 IPA", next);
	assert.notEqual(rejected.status, 0);
	assert.match(rejected.stdout, /invalid CFBundleIdentifier/);
});
