// Waits for the build Apple just accepted to reach a testable state, and prints why if it does not.
// A run that only sees "UPLOAD SUCCEEDED" hid twenty builds sitting in Ready to Submit; this is the
// missing check.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const { KEY_ID, ISSUER_ID, KEY_PATH, BUNDLE_ID, BUILD_NUMBER } = process.env;
const key = readFileSync(KEY_PATH, "utf8");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = () => {
	const now = Math.floor(Date.now() / 1000);
	const input = `${b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" })}.${b64({ iss: ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" })}`;
	return `${input}.${createSign("SHA256").update(input).sign({ key, dsaEncoding: "ieee-p1363" }, "base64url")}`;
};
const api = async (path) => {
	const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
		headers: { Authorization: `Bearer ${token()}` },
	});
	const body = await res.json();
	if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(body).slice(0, 500)}`);
	return body;
};

const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
const app = apps.data?.[0];
if (!app) throw new Error(`no app record for bundle ${BUNDLE_ID}`);
console.log(`app ${app.id} ${app.attributes?.name}`);

let build;
for (let attempt = 0; attempt < 60; attempt++) {
	const list = await api(
		`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD_NUMBER}&limit=1&include=buildBundles`,
	);
	build = list.data?.[0];
	const state = build?.attributes?.processingState;
	console.log(`attempt ${attempt + 1}: processingState=${state ?? "(no build yet)"}`);
	if (build && state === "VALID") break;
	if (state === "FAILED" || state === "INVALID") {
		throw new Error(`Apple rejected build ${BUILD_NUMBER}: ${JSON.stringify(build.attributes)}`);
	}
	await sleep(30_000);
}
if (!build || build.attributes?.processingState !== "VALID") {
	throw new Error(`build ${BUILD_NUMBER} never finished processing`);
}
console.log(
	`build ${build.id} expired=${build.attributes.expired} usesNonExemptEncryption=${build.attributes.usesNonExemptEncryption}`,
);

// Export compliance is the one attribute that silently keeps a valid build out of testing.
if (build.attributes.usesNonExemptEncryption == null) {
	console.log("::warning::export compliance is unanswered; the build cannot become Ready to Test");
}

const groups = await api(`/v1/builds/${build.id}/relationships/betaGroups?limit=50`).catch(() => ({ data: [] }));
console.log(`beta groups: ${groups.data.length}`);
const detail = [];
for (const group of groups.data) {
	const g = await api(`/v1/betaGroups/${group.id}`);
	detail.push(`${g.data.attributes.name} (internal=${g.data.attributes.isInternalGroup})`);
}
console.log(detail.join(", "));

const stated = build.attributes.expired ? "EXPIRED" : "VALID";
if (build.attributes.expired) throw new Error(`build ${BUILD_NUMBER} is expired`);
if (!groups.data.length) {
	throw new Error(
		`build ${BUILD_NUMBER} processed but is in no TestFlight group, so it stays Ready to Submit and no tester can install it`,
	);
}
console.log(`build ${BUILD_NUMBER} is testable (${stated}) in ${groups.data.length} group(s)`);
