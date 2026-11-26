import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

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
	const text = await res.text();
	return { status: res.status, body: text ? JSON.parse(text) : {} };
};
const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
const app = apps.body.data[0];
const list = await api(`/v1/builds?filter[app]=${app.id}&limit=6&sort=-uploadedDate`);
for (const b of list.body.data) {
	const d = await api(`/v1/builds/${b.id}/buildBetaDetail`);
	const a = d.body.data?.attributes ?? {};
	console.log(
		`build ${b.attributes.version} audience=${b.attributes.buildAudienceType}` +
			` internal=${a.internalBuildState} external=${a.externalBuildState} autoNotify=${a.autoNotifyEnabled}`,
	);
	if (d.status !== 200) console.log(`   detail ${d.status} ${JSON.stringify(d.body).slice(0, 200)}`);
}
