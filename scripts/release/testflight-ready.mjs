// Waits for the build Apple just accepted to reach a testable state, adds it to the internal
// TestFlight group when it is not there, and prints the reason when it still cannot be installed.
//
// Why the assignment lives here: `UPLOAD SUCCEEDED` only means Apple accepted the bytes. Every
// build from 0.3.26112410 on finished processing as VALID and then sat in Ready to Submit with
// no beta group, so no tester could install anything while the pipeline stayed green. Uploading
// is not distributing; the build has to be handed to a group.

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
const api = async (path, init) => {
	const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
		headers: { Authorization: `Bearer ${token()}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
		...init,
	});
	const text = await res.text();
	const body = text ? JSON.parse(text) : {};
	if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 500)}`);
	return body;
};

const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
const app = apps.data?.[0];
if (!app) throw new Error(`no app record for bundle ${BUNDLE_ID}`);
console.log(`app ${app.id} ${app.attributes?.name}`);

let build;
for (let attempt = 0; attempt < 60; attempt++) {
	const list = await api(`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD_NUMBER}&limit=1`);
	build = list.data?.[0];
	const state = build?.attributes?.processingState;
	console.log(`attempt ${attempt + 1}: processingState=${state ?? "(no build yet)"}`);
	if (build && state === "VALID") break;
	if (state === "FAILED" || state === "INVALID") {
		throw new Error(`Apple rejected build ${BUILD_NUMBER}: ${JSON.stringify(build.attributes)}`);
	}
	await sleep(30_000);
}
if (build?.attributes?.processingState !== "VALID") {
	throw new Error(`build ${BUILD_NUMBER} never finished processing`);
}
console.log(`build ${build.id} expired=${build.attributes.expired}`);

// Export compliance is the one attribute that silently keeps a valid build out of testing.
if (build.attributes.usesNonExemptEncryption == null) {
	console.log("::warning::export compliance is unanswered; the build cannot become Ready to Test");
}
if (build.attributes.expired) throw new Error(`build ${BUILD_NUMBER} is expired`);

/** The internal group is the one every build belongs to; a missing one is a setup fault, not a skip. */
async function internalGroup() {
	const groups = await api(`/v1/betaGroups?filter[app]=${app.id}&limit=200`);
	const internal = groups.data.filter((group) => group.attributes.isInternalGroup);
	if (internal.length === 1) return internal[0];
	if (internal.length > 1) {
		throw new Error(`app has ${internal.length} internal TestFlight groups; refuse to guess which one gets the build`);
	}
	throw new Error(`app has no internal TestFlight group; create one in App Store Connect > TestFlight`);
}

const attached = async () => (await api(`/v1/builds/${build.id}/relationships/betaGroups?limit=50`)).data;

let groups = await attached();
if (groups.length === 0) {
	const group = await internalGroup();
	await api(`/v1/builds/${build.id}/relationships/betaGroups`, {
		method: "POST",
		body: JSON.stringify({ data: [{ type: "betaGroups", id: group.id }] }),
	});
	console.log(`attached build ${BUILD_NUMBER} to internal group ${group.id} (${group.attributes.name})`);
	// Apple's relationship is eventually consistent; give it a moment before insisting.
	for (let attempt = 0; attempt < 10 && groups.length === 0; attempt++) {
		await sleep(6_000);
		groups = await attached();
	}
} else {
	console.log(`build ${BUILD_NUMBER} was already in ${groups.length} group(s)`);
}

if (groups.length === 0) {
	throw new Error(`build ${BUILD_NUMBER} is still in no TestFlight group after attaching it to the internal one`);
}
const named = [];
for (const group of groups) {
	const g = await api(`/v1/betaGroups/${group.id}`);
	named.push(`${g.data.attributes.name} (internal=${g.data.attributes.isInternalGroup})`);
}
console.log(`build ${BUILD_NUMBER} is testable in ${named.join(", ")}`);
