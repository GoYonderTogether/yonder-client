import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const { KEY_ID, ISSUER_ID, KEY_PATH } = process.env;
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
	return { status: res.status, body: text ? JSON.parse(text) : {} };
};

const apps = await api(`/v1/apps?limit=50`);
console.log(`APP RECORDS (${apps.body.data?.length ?? 0}):`);
for (const a of apps.body.data ?? []) {
	console.log(
		`  ${a.id} "${a.attributes.name}" bundle=${a.attributes.bundleId} sku=${a.attributes.sku} state=${a.attributes.appStoreState ?? "-"}`,
	);
}

const ids = await api(`/v1/bundleIds?limit=50&include=bundleIdCapabilities`);
console.log(`\nBUNDLE IDS (${ids.body.data?.length ?? 0}):`);
for (const b of ids.body.data ?? []) {
	const caps = (b.relationships?.bundleIdCapabilities?.data ?? []).map((c) => c.id);
	console.log(
		`  ${b.id} ${b.attributes.identifier} name=${b.attributes.name} platform=${b.attributes.platform} caps=${caps.length ? caps.join(",") : "NONE"}`,
	);
}
for (const inc of ids.body.included ?? []) {
	console.log(`  capability ${inc.id} ${JSON.stringify(inc.attributes)}`);
}

const profiles = await api(`/v1/profiles?limit=50&include=bundleId,certificates`);
console.log(`\nPROFILES (${profiles.body.data?.length ?? 0}):`);
for (const pr of profiles.body.data ?? []) {
	console.log(
		`  ${pr.id} "${pr.attributes.name}" state=${pr.attributes.profileState} type=${pr.attributes.profileType} expires=${pr.attributes.expirationDate}`,
	);
}
