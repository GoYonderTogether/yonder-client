import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const groupName = "公测";
const betaStates = [
	"PROCESSING",
	"PROCESSING_EXCEPTION",
	"MISSING_EXPORT_COMPLIANCE",
	"IN_EXPORT_COMPLIANCE_REVIEW",
	"READY_FOR_BETA_SUBMISSION",
	"READY_FOR_BETA_TESTING",
	"WAITING_FOR_BETA_REVIEW",
	"IN_BETA_REVIEW",
	"BETA_APPROVED",
	"BETA_REJECTED",
	"IN_BETA_TESTING",
	"NOT_APPLICABLE",
	"EXPIRED",
];
const safeState = (value, allowed) => (allowed.includes(value) ? value : null);
const reviewStates = ["WAITING_FOR_REVIEW", "IN_REVIEW", "APPROVED", "REJECTED"];
class StatusError extends Error {}

export function appStoreConnectApi(jwt, request = fetch) {
	return async function get(label, path, allowMissing = false) {
		let response;
		try {
			response = await request(`https://api.appstoreconnect.apple.com${path}`, {
				headers: { Authorization: `Bearer ${jwt}` },
				redirect: "error",
				signal: AbortSignal.timeout(30_000),
			});
		} catch {
			throw new StatusError(`${label}: request failed`);
		}
		if (allowMissing && response.status === 404) return {};
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			const code = body?.errors?.[0]?.code;
			const safeCode = typeof code === "string" && /^[A-Z][A-Z0-9_.]{1,120}$/.test(code) ? ` ${code}` : "";
			throw new StatusError(`${label}: HTTP ${response.status}${safeCode}`);
		}
		if (!body) throw new StatusError(`${label}: invalid response`);
		return body;
	};
}

export function isExactBuildNumber(value) {
	return typeof value === "string" && value.length <= 18 && /^\d+(?:\.\d+){0,2}$/.test(value);
}

export async function testFlightStatus(get, { bundleId, buildNumber }) {
	if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(bundleId ?? "")) throw new StatusError("Expected an app bundle ID");
	if (!isExactBuildNumber(buildNumber)) {
		throw new StatusError("Expected an exact CFBundleVersion");
	}
	const { data: apps } = await get(
		"Find app",
		`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId&limit=2`,
	);
	if (apps.length !== 1 || apps[0].attributes.bundleId !== bundleId) {
		throw new StatusError("Bundle ID did not match exactly one app");
	}
	const appId = encodeURIComponent(apps[0].id);
	const groupQuery =
		`/v1/betaGroups?filter[app]=${appId}&filter[name]=${encodeURIComponent(groupName)}&filter[isInternalGroup]=false` +
		"&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled,publicLinkLimitEnabled,publicLinkLimit&limit=2";
	const [{ data: builds }, { data: groups }] = await Promise.all([
		get(
			"Find exact iOS build",
			`/v1/builds?filter[app]=${appId}&filter[version]=${buildNumber}&filter[preReleaseVersion.platform]=IOS` +
				"&include=betaGroups&fields[betaGroups]=name" +
				"&fields[builds]=version,processingState,expired,buildAudienceType,usesNonExemptEncryption,betaGroups&limit=2",
		),
		get("Find external group", groupQuery),
	]);
	const matchingGroups = groups.filter(
		(group) => group.attributes.name === groupName && group.attributes.isInternalGroup === false,
	);
	const group = matchingGroups.length === 1 ? matchingGroups[0] : undefined;
	const build = builds.length === 1 && builds[0].attributes.version === buildNumber ? builds[0] : undefined;
	const buildId = build ? encodeURIComponent(build.id) : null;
	const assigned = async () => {
		if (!build || !group) return null;
		const buildGroups = build.relationships?.betaGroups?.data;
		if (buildGroups) return buildGroups.some((entry) => entry.id === group.id);
		const { data, links } = await get(
			"Read public group builds",
			`/v1/betaGroups/${encodeURIComponent(group.id)}/builds?fields[builds]=version&limit=200`,
		);
		return data.some((entry) => entry.id === build.id) || (links?.next ? null : false);
	};
	const [detail, review, isAssigned] = buildId
		? await Promise.all([
				get("Read beta build state", `/v1/builds/${buildId}/buildBetaDetail`, true),
				get(
					"Read beta review status",
					`/v1/betaAppReviewSubmissions?filter[build]=${buildId}&fields[betaAppReviewSubmissions]=betaReviewState&limit=2`,
				),
				assigned(),
			])
		: [{}, {}, null];
	const attributes = build?.attributes;
	const beta = detail.data?.attributes;
	const submissions = review.data;
	const linkLimit = group?.attributes.publicLinkLimit;
	return {
		buildNumber,
		buildMatches: builds.length,
		processing: safeState(attributes?.processingState, ["PROCESSING", "FAILED", "INVALID", "VALID"]),
		audience: safeState(attributes?.buildAudienceType, ["INTERNAL_ONLY", "APP_STORE_ELIGIBLE"]),
		expired: typeof attributes?.expired === "boolean" ? attributes.expired : null,
		exportComplianceAnswered: attributes ? typeof attributes.usesNonExemptEncryption === "boolean" : null,
		internal: safeState(beta?.internalBuildState, betaStates),
		external: safeState(beta?.externalBuildState, betaStates),
		review:
			submissions?.length === 0
				? "NONE"
				: submissions?.length === 1
					? safeState(submissions[0].attributes.betaReviewState, reviewStates)
					: null,
		group: groupName,
		groupMatches: matchingGroups.length,
		assigned: isAssigned,
		publicLinkEnabled: group ? group.attributes.publicLinkEnabled === true : null,
		publicLinkLimit:
			group?.attributes.publicLinkLimitEnabled === true && Number.isInteger(linkLimit) ? linkLimit : null,
	};
}

function tokenFromEnvironment({ KEY_ID, ISSUER_ID, KEY_PATH }) {
	const now = Math.floor(Date.now() / 1000);
	const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
	const input = `${b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" })}.${b64({ iss: ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" })}`;
	const key = readFileSync(KEY_PATH, "utf8");
	return `${input}.${createSign("SHA256").update(input).sign({ key, dsaEncoding: "ieee-p1363" }, "base64url")}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const { BUNDLE_ID: bundleId, BUILD_NUMBER: buildNumber } = process.env;
		const status = await testFlightStatus(appStoreConnectApi(tokenFromEnvironment(process.env)), {
			bundleId,
			buildNumber,
		});
		console.log(JSON.stringify(status, null, 2));
	} catch (error) {
		console.error(error instanceof StatusError ? error.message : "TestFlight status check failed before completion");
		process.exitCode = 1;
	}
}
