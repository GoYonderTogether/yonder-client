import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const { KEY_ID, ISSUER_ID, KEY_PATH, BUNDLE_ID } = process.env;
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
	const text = await res.text();
	if (!res.ok) return { error: `${res.status} ${text.slice(0, 300)}` };
	return JSON.parse(text);
};

const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
const app = apps.data[0];
console.log(`APP ${app.id}`);

const groups = await api(`/v1/betaGroups?filter[app]=${app.id}&limit=50&include=betaTesters,builds`);
for (const g of groups.data) {
	const attrs = g.attributes;
	console.log(`GROUP ${g.id} "${attrs.name}" internal=${attrs.isInternalGroup}`);
	for (const k of Object.keys(attrs).sort()) {
		if (k === "name" || k === "isInternalGroup") continue;
		console.log(`    ${k} = ${JSON.stringify(attrs[k])}`);
	}
	const rel = g.relationships ?? {};
	for (const k of Object.keys(rel).sort()) {
		const data = rel[k]?.data;
		console.log(`    rel.${k} = ${Array.isArray(data) ? `[${data.length}]` : JSON.stringify(data)}`);
	}
}

// Which builds each group lists, and the review state of the newest build.
const builds = await api(`/v1/builds?filter[app]=${app.id}&limit=5&sort=-uploadedDate&include=betaGroups,buildBundles`);
console.log(`\nNEWEST BUILDS`);
for (const b of builds.data) {
	console.log(`  build ${b.attributes.version} state=${b.attributes.processingState} expired=${b.attributes.expired}`);
	for (const k of Object.keys(b.attributes).sort()) {
		if (["version", "processingState", "expired"].includes(k)) continue;
		console.log(`     ${k} = ${JSON.stringify(b.attributes[k])}`);
	}
}
const review = await api(`/v1/betaAppReviewSubmissions?filter[build]=${builds.data[0].id}`);
console.log(`\nBETA REVIEW for newest: ${JSON.stringify(review).slice(0, 400)}`);
const localizations = await api(`/v1/betaGroups/${groups.data[0].id}/betaGroupLocalizations`);
console.log(`\nGROUP LOCALIZATIONS: ${JSON.stringify(localizations).slice(0, 600)}`);
const testers = await api(`/v1/betaTesters?filter[apps]=${app.id}&limit=20`);
console.log(`\nTESTERS ${testers.data?.length ?? "?"}`);
for (const t of testers.data ?? []) {
	console.log(`  ${t.attributes.email} state=${t.attributes.state ?? "-"} invite=${t.attributes.inviteType ?? "-"}`);
}
