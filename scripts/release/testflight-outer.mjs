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

function writeErrorReason(error) {
	const detail = [error?.code, error?.title, error?.detail].join(" ");
	if (/expir|invalid.{0,15}build|build.{0,15}invalid/i.test(detail)) return "Apple flagged the build validity";
	if (/encrypt|export compliance/i.test(detail)) return "Apple flagged export compliance";
	if (/localiz|description|what.s new|what to test|feedback email/i.test(detail))
		return "Apple flagged beta testing metadata";
	if (/demo account|review information|contact information|betaAppReviewDetail/i.test(detail))
		return "Apple flagged beta review information";
	if (/agreement|contract/i.test(detail)) return "Apple flagged a developer agreement";
	if (/already.{0,20}(review|submitt)|in review|review.{0,15}limit/i.test(detail))
		return "Apple flagged an existing review or review limit";
	return "Apple gave no recognized validation reason";
}

export function appStoreConnectApi(jwt, request = fetch) {
	return async function get(label, path, { allowMissing = false, data } = {}) {
		let response;
		try {
			response = await request(`https://api.appstoreconnect.apple.com${path}`, {
				...(data && { method: "POST", body: JSON.stringify({ data }) }),
				headers: { Authorization: `Bearer ${jwt}`, ...(data && { "Content-Type": "application/json" }) },
				redirect: "error",
				signal: AbortSignal.timeout(30_000),
			});
		} catch {
			throw new StatusError(`${label}: request failed`);
		}
		if (allowMissing && response.status === 404) return {};
		if (response.status === 204) return {};
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			const error = body?.errors?.[0];
			const code = error?.code;
			const safeCode = typeof code === "string" && /^[A-Z][A-Z0-9_.]{1,120}$/.test(code) ? ` ${code}` : "";
			const requestId = [
				error?.id,
				response.headers.get("x-apple-request-uuid"),
				response.headers.get("x-request-id"),
			].find((value) => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value));
			const reason = data ? `; ${writeErrorReason(error)}` : "";
			throw new StatusError(
				`${label}: HTTP ${response.status}${safeCode}${reason}${requestId ? `; Apple request ID ${requestId}` : ""}`,
				{
					cause: response.status,
				},
			);
		}
		if (!body) throw new StatusError(`${label}: invalid response`);
		return body;
	};
}

export async function testFlightStatus(get, { bundleId, buildNumber, submit = false }) {
	if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(bundleId ?? "")) throw new StatusError("Expected an app bundle ID");
	if (typeof buildNumber !== "string" || buildNumber.length > 18 || !/^\d+(?:\.\d+){0,2}$/.test(buildNumber)) {
		throw new StatusError("Expected an exact CFBundleVersion");
	}
	if (submit && (bundleId !== "net.yonderbot.app" || buildNumber !== "26112604")) {
		throw new StatusError("Recovery submission is limited to net.yonderbot.app build 26112604");
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
	const readBeta = () => get("Read beta build state", `/v1/builds/${buildId}/buildBetaDetail`, { allowMissing: true });
	const readReview = () =>
		get(
			"Read beta review status",
			`/v1/betaAppReviewSubmissions?filter[build]=${buildId}&fields[betaAppReviewSubmissions]=betaReviewState&limit=2`,
		);
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
		? await Promise.all([readBeta(), readReview(), assigned()])
		: [{}, {}, null];
	const attributes = build?.attributes;
	const beta = detail.data?.attributes;
	const submissions = review.data;
	const linkLimit = group?.attributes.publicLinkLimit;
	const status = {
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
	if (!submit) return status;
	if (
		status.processing !== "VALID" ||
		status.audience !== "APP_STORE_ELIGIBLE" ||
		status.expired !== false ||
		!status.exportComplianceAnswered ||
		status.assigned === null ||
		!status.publicLinkEnabled ||
		!(status.publicLinkLimit > 0 && status.publicLinkLimit <= 100)
	) {
		throw new StatusError("Recovery requires an eligible, compliant build and the exact capped 公测 group");
	}
	const distributable = [
		"WAITING_FOR_BETA_REVIEW",
		"IN_BETA_REVIEW",
		"BETA_APPROVED",
		"READY_FOR_BETA_TESTING",
		"IN_BETA_TESTING",
	];
	if (
		status.review === null ||
		status.review === "REJECTED" ||
		!["READY_FOR_BETA_SUBMISSION", ...distributable].includes(status.external)
	) {
		throw new StatusError("Recovery requires a build ready for beta submission or already accepted for review");
	}
	const buildResource = { type: "builds", id: build.id };
	const recovery = { assignment: status.assigned ? "EXISTING" : null, review: status.review };
	if (!status.assigned) {
		try {
			await get("Add exact build to 公测", `/v1/betaGroups/${encodeURIComponent(group.id)}/relationships/builds`, {
				data: [buildResource],
			});
			recovery.assignment = "ACCEPTED";
		} catch (error) {
			if (!(error instanceof StatusError) || ![409, 422].includes(error.cause)) throw error;
			// A group validation failure may still allow direct review of the build.
			console.error(error.message);
			recovery.assignment = (await assigned()) ? "EXISTING" : "REJECTED";
		}
	}
	const [updatedDetail, updatedReview] = await Promise.all([readBeta(), readReview()]);
	const external = updatedDetail.data?.attributes.externalBuildState;
	const reviews = updatedReview.data;
	if (
		reviews.length === 1 &&
		["WAITING_FOR_REVIEW", "IN_REVIEW", "APPROVED"].includes(reviews[0].attributes.betaReviewState)
	) {
		recovery.review = reviews[0].attributes.betaReviewState;
	} else if (reviews.length === 0 && external === "READY_FOR_BETA_SUBMISSION") {
		const submitted = await get("Submit exact build for Beta App Review", "/v1/betaAppReviewSubmissions", {
			data: {
				type: "betaAppReviewSubmissions",
				relationships: { build: { data: buildResource } },
			},
		});
		recovery.review = safeState(submitted.data?.attributes.betaReviewState, reviewStates) ?? "ACCEPTED";
	} else if (reviews.length === 0 && distributable.includes(external)) {
		recovery.review = external;
	} else {
		throw new StatusError("Apple beta review state changed; check the build in App Store Connect");
	}
	return { ...status, recovery };
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
		const { BUNDLE_ID: bundleId, BUILD_NUMBER: buildNumber, SUBMIT_26112604 } = process.env;
		const status = await testFlightStatus(appStoreConnectApi(tokenFromEnvironment(process.env)), {
			bundleId,
			buildNumber,
			submit: SUBMIT_26112604 === "true",
		});
		console.log(JSON.stringify(status, null, 2));
	} catch (error) {
		console.error(error instanceof StatusError ? error.message : "TestFlight status check failed before completion");
		process.exitCode = 1;
	}
}
