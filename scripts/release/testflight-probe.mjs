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
	if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 800)}`);
	return JSON.parse(text);
};

const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
const app = apps.data[0];
console.log(`APP ${app.id} ${app.attributes.name}`);

const groups = await api(`/v1/betaGroups?filter[app]=${app.id}&limit=50`);
console.log(`GROUPS total=${groups.data.length}`);
for (const g of groups.data) {
	console.log(
		`  group ${g.id} "${g.attributes.name}" internal=${g.attributes.isInternalGroup} createdDate=${g.attributes.createdDate}`,
	);
}

const builds = await api(`/v1/builds?filter[app]=${app.id}&limit=30&sort=-uploadedDate&include=betaGroups`);
console.log(`BUILDS ${builds.data.length}`);
const groupName = Object.fromEntries(
	(builds.included ?? []).map((i) => [i.id, `${i.attributes?.name}(internal=${i.attributes?.isInternalGroup})`]),
);
for (const b of builds.data) {
	const rel = b.relationships?.betaGroups?.data ?? [];
	const names = rel.map((r) => groupName[r.id] ?? r.id).join(", ") || "NONE";
	console.log(
		`  build ${b.attributes.version} state=${b.attributes.processingState} expired=${b.attributes.expired} groups=[${names}] uploaded=${b.attributes.uploadedDate}`,
	);
}
