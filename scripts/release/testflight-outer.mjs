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
const builds = await api(
	`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD_NUMBER}&limit=1&include=buildBetaDetail,betaBuildMetrics`,
);
const b = builds.body.data[0];
console.log(
	`build ${b.attributes.version} audience=${b.attributes.buildAudienceType} state=${b.attributes.processingState}`,
);
for (const inc of builds.body.included ?? []) {
	if (inc.type === "buildBetaDetails") {
		console.log(`buildBetaDetail:`);
		for (const [k, v] of Object.entries(inc.attributes ?? {})) console.log(`   ${k} = ${JSON.stringify(v)}`);
	} else {
		console.log(`${inc.type}: ${JSON.stringify(inc.attributes).slice(0, 300)}`);
	}
}
const detail = await api(`/v1/builds/${b.id}/buildBetaDetail`);
console.log(`\ndirect buildBetaDetail: ${detail.status} ${JSON.stringify(detail.body).slice(0, 900)}`);
// every localization for this build, and whether the app record's primary locale matches one
const locs = await api(`/v1/builds/${b.id}/betaBuildLocalizations`);
console.log(
	`\nlocalizations: ${(locs.body.data ?? []).map((l) => `${l.attributes.locale}(whatsNew=${l.attributes.whatsNew ? "set" : "null"})`).join(", ")}`,
);
console.log(`app primaryLocale=${app.attributes.primaryLocale}`);
