// Waits for the build Apple just accepted, hands it to the internal TestFlight group, and reports
// the TestFlight state that decides whether a tester can install it.
//
// Two facts that cost a debugging session:
//   * `UPLOAD SUCCEEDED` only means Apple accepted the bytes. Upload 0.3.26112410 onward and the
//     build can sit in Ready to Submit — valid, but not opened to any tester, who then sees an
//     invitation with nothing to install.
//   * `GET /v1/builds/{id}/relationships/betaGroups` is refused (403, "Allowed operations are:
//     CREATE, DELETE"). Reading it must go through the build's `betaGroups` include; a swallowed
//     error there reports an empty list and invents a cause that is not real.

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

/** The build plus the beta groups it is actually in, read the one way the API allows. */
const findBuild = () =>
	api(`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD_NUMBER}&limit=1&include=betaGroups`);

let build;
let groups = [];
for (let attempt = 0; attempt < 60; attempt++) {
	const list = await findBuild();
	build = list.data?.[0];
	const state = build?.attributes?.processingState;
	const included = (list.included ?? []).filter((item) => item.type === "betaGroups");
	console.log(`attempt ${attempt + 1}: processingState=${state ?? "(no build yet)"} groups=${included.length}`);
	if (build && state === "VALID") {
		groups = included;
		break;
	}
	if (state === "FAILED" || state === "INVALID") {
		throw new Error(`Apple rejected build ${BUILD_NUMBER}: ${JSON.stringify(build.attributes)}`);
	}
	await sleep(30_000);
}
if (build?.attributes?.processingState !== "VALID") throw new Error(`build ${BUILD_NUMBER} never finished processing`);
console.log(
	`build ${build.id} expired=${build.attributes.expired} usesNonExemptEncryption=${build.attributes.usesNonExemptEncryption}`,
);
if (build.attributes.expired) throw new Error(`build ${BUILD_NUMBER} is expired`);

// Export compliance is the one attribute that silently keeps a valid build out of testing.
if (build.attributes.usesNonExemptEncryption == null) {
	console.log("::warning::export compliance is unanswered; the build cannot become Ready to Test");
}

if (groups.length === 0) {
	const internal = (await api(`/v1/betaGroups?filter[app]=${app.id}&limit=200`)).data.filter(
		(group) => group.attributes.isInternalGroup,
	);
	// Guessing here would put the build in front of the wrong people; a wrong count is a setup
	// fault the operator has to settle in App Store Connect.
	if (internal.length !== 1) {
		throw new Error(
			`build ${BUILD_NUMBER} is in no group and the app has ${internal.length} internal groups; expected exactly one`,
		);
	}
	await api(`/v1/builds/${build.id}/relationships/betaGroups`, {
		method: "POST",
		body: JSON.stringify({ data: [{ type: "betaGroups", id: internal[0].id }] }),
	});
	console.log(`attached build ${BUILD_NUMBER} to internal group ${internal[0].id} (${internal[0].attributes.name})`);
	// The relationship is eventually consistent; read it back rather than trusting the POST.
	for (let attempt = 0; attempt < 20 && groups.length === 0; attempt++) {
		await sleep(9_000);
		const list = await findBuild();
		groups = (list.included ?? []).filter((item) => item.type === "betaGroups");
	}
	if (groups.length === 0) throw new Error(`build ${BUILD_NUMBER} is still in no TestFlight group after attaching`);
} else {
	console.log(`build ${BUILD_NUMBER} was already in ${groups.length} group(s)`);
}

const named = [];
for (const group of groups) {
	const g = await api(`/v1/betaGroups/${group.id}`);
	named.push(`${g.data.attributes.name} (internal=${g.data.attributes.isInternalGroup})`);
}
console.log(`build ${BUILD_NUMBER} is testable in ${named.join(", ")}`);
