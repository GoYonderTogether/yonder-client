import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const { KEY_ID, ISSUER_ID, KEY_PATH, BUNDLE_ID, BUILD_NUMBER, ACTION } = process.env;
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
	return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : {} };
};
const show = (label, r) => console.log(`${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);

const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
const app = apps.body.data[0];
const groups = await api(`/v1/betaGroups?filter[app]=${app.id}&limit=50`);
const outer = groups.body.data.find((g) => !g.attributes.isInternalGroup);
console.log(`outer group ${outer.id} "${outer.attributes.name}"`);

const builds = await api(`/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD_NUMBER}&limit=1`);
const build = builds.body.data[0];
console.log(`build ${build.attributes.version} audience=${build.attributes.buildAudienceType}`);

// 1. what the external lane needs before a review submission can be made
const detail = await api(`/v1/apps/${app.id}/betaAppReviewDetail`);
show("betaAppReviewDetail", detail);
const locs = await api(`/v1/builds/${build.id}/betaBuildLocalizations`);
show("betaBuildLocalizations", locs);

if (ACTION !== "do") {
	console.log("dry run: pass ACTION=do to attach and submit");
	process.exit(0);
}

// 2. attach the build to the external group
show(
	"attach",
	await api(`/v1/builds/${build.id}/relationships/betaGroups`, {
		method: "POST",
		body: JSON.stringify({ data: [{ type: "betaGroups", id: outer.id }] }),
	}),
);

// 3. Outside testers need a "what to test" text per locale. The zh-Hans record already exists
// with whatsNew = null, so patch it rather than creating a duplicate.
const zh = (locs.body.data ?? []).find((l) => l.attributes.locale === "zh-Hans");
const whatsNew = "测试版本：Bot 聊天、消息通知、录音笔记。请重点测试消息推送能否收到。";
if (zh) {
	show(
		"localize zh",
		await api(`/v1/betaBuildLocalizations/${zh.id}`, {
			method: "PATCH",
			body: JSON.stringify({ data: { type: "betaBuildLocalizations", id: zh.id, attributes: { whatsNew } } }),
		}),
	);
} else {
	show(
		"localize zh",
		await api(`/v1/betaBuildLocalizations`, {
			method: "POST",
			body: JSON.stringify({
				data: {
					type: "betaBuildLocalizations",
					attributes: { locale: "zh-Hans", whatsNew },
					relationships: { build: { data: { type: "builds", id: build.id } } },
				},
			}),
		}),
	);
}

// 4. submit for Beta App Review
show(
	"review",
	await api(`/v1/betaAppReviewSubmissions`, {
		method: "POST",
		body: JSON.stringify({
			data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: build.id } } } },
		}),
	}),
);
