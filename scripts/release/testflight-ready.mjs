// Check internal TestFlight availability after Apple processes the upload.

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

// Apple allows POST/DELETE on the betaGroups relationship, but only the builds include can read it.
const findBuild = () =>
	api(`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD_NUMBER}&limit=1&include=betaGroups`);
const internalGroups = (list) =>
	(list.included ?? []).filter((group) => group.type === "betaGroups" && group.attributes.isInternalGroup);

let build;
let group;
for (let attempt = 0; attempt < 60; attempt++) {
	const list = await findBuild();
	build = list.data?.[0];
	const state = build?.attributes?.processingState;
	console.log(`attempt ${attempt + 1}: processingState=${state ?? "(no build yet)"}`);
	if (state === "VALID") {
		group = internalGroups(list)[0];
		break;
	}
	if (state === "FAILED" || state === "INVALID") {
		throw new Error(`Apple rejected build ${BUILD_NUMBER}: ${JSON.stringify(build.attributes)}`);
	}
	await sleep(30_000);
}
if (build?.attributes?.processingState !== "VALID") {
	throw new Error(`build ${BUILD_NUMBER} never finished processing`);
}
if (build.attributes.expired) throw new Error(`build ${BUILD_NUMBER} is expired`);
if (build.attributes.usesNonExemptEncryption == null) {
	throw new Error(`build ${BUILD_NUMBER} is missing an export compliance answer`);
}

let attached = Boolean(group);
if (!group) {
	const groups = await api(`/v1/betaGroups?filter[app]=${app.id}&limit=200`);
	const internal = groups.data.filter((item) => item.attributes.isInternalGroup);
	if (internal.length !== 1) {
		throw new Error(`app has ${internal.length} internal TestFlight groups; expected exactly one to assign the build`);
	}
	group = internal[0];
	if (!group.attributes.hasAccessToAllBuilds) {
		await api(`/v1/builds/${build.id}/relationships/betaGroups`, {
			method: "POST",
			body: JSON.stringify({ data: [{ type: "betaGroups", id: group.id }] }),
		});
		console.log(`assigned build ${BUILD_NUMBER} to internal group ${group.attributes.name}`);
	}
}

attached ||= group.attributes.hasAccessToAllBuilds === true;
let state;
for (let attempt = 0; attempt < 20; attempt++) {
	if (!attached) attached = internalGroups(await findBuild()).some((item) => item.id === group.id);
	const detail = await api(`/v1/builds/${build.id}/buildBetaDetail`);
	state = detail.data.attributes.internalBuildState;
	if (state === "IN_BETA_TESTING" && attached) break;
	if (!["PROCESSING", "READY_FOR_BETA_TESTING", "IN_BETA_TESTING"].includes(state)) {
		throw new Error(`build ${BUILD_NUMBER} cannot start internal testing: ${state}`);
	}
	await sleep(9_000);
}
if (state !== "IN_BETA_TESTING" || !attached) {
	throw new Error(`build ${BUILD_NUMBER} is unavailable to the internal group (state=${state}, attached=${attached})`);
}
console.log(`build ${BUILD_NUMBER} is testable in ${group.attributes.name} (internal=${state})`);
