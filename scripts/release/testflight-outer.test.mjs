import assert from "node:assert/strict";
import { test } from "node:test";
import { appStoreConnectApi, testFlightStatus } from "./testflight-outer.mjs";

test("probe filters for the exact iOS build and reports only sanitized public group status", async () => {
	const bundleId = "net.yonderbot.app";
	const buildNumber = "26112603";
	const group = {
		id: "public-group",
		attributes: {
			name: "公测",
			isInternalGroup: false,
			publicLinkEnabled: true,
			publicLinkLimitEnabled: true,
			publicLinkLimit: 20,
		},
	};
	const get = appStoreConnectApi("unused-token", async (url, options) => {
		assert.equal(options.method, undefined);
		const { pathname, searchParams } = new URL(url);
		switch (pathname) {
			case "/v1/apps":
				assert.equal(searchParams.get("filter[bundleId]"), bundleId);
				return Response.json({ data: [{ id: "app-1", attributes: { bundleId } }] });
			case "/v1/builds":
				assert.equal(searchParams.get("filter[version]"), buildNumber);
				assert.equal(searchParams.get("filter[preReleaseVersion.platform]"), "IOS");
				assert.equal(searchParams.get("include"), "betaGroups");
				assert.ok(searchParams.get("fields[builds]").split(",").includes("betaGroups"));
				assert.equal(searchParams.get("fields[betaGroups]"), "name");
				return Response.json({
					data: [
						{
							id: "exact-build",
							relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } },
							attributes: {
								version: buildNumber,
								processingState: "VALID",
								expired: false,
								buildAudienceType: "APP_STORE_ELIGIBLE",
								usesNonExemptEncryption: false,
							},
						},
					],
				});
			case "/v1/betaGroups":
				assert.equal(searchParams.get("filter[name]"), "公测");
				assert.equal(searchParams.get("filter[isInternalGroup]"), "false");
				assert.doesNotMatch(searchParams.get("fields[betaGroups]"), /publicLink,|publicLinkId|betaTesters/);
				assert.equal(searchParams.get("filter[builds]"), null);
				return Response.json({
					data: [{ ...group, attributes: { ...group.attributes, publicLink: "sensitive-link" } }],
				});
			case "/v1/builds/exact-build/buildBetaDetail":
				return Response.json({ data: { attributes: { externalBuildState: "IN_BETA_TESTING" } } });
			case "/v1/betaAppReviewSubmissions":
				assert.equal(searchParams.get("filter[build]"), "exact-build");
				assert.equal(searchParams.get("fields[betaAppReviewSubmissions]"), "betaReviewState");
				return Response.json({ data: [{ attributes: { betaReviewState: "APPROVED" } }] });
			default:
				assert.fail(`Unexpected API call: ${pathname}`);
		}
	});
	const status = await testFlightStatus(get, { bundleId, buildNumber });
	assert.equal(status.buildNumber, buildNumber);
	assert.equal(status.audience, "APP_STORE_ELIGIBLE");
	assert.equal(status.assigned, true);
	assert.equal(status.review, "APPROVED");
	assert.equal(status.publicLinkEnabled, true);
	assert.equal(status.publicLinkLimit, 20);
	assert.doesNotMatch(JSON.stringify(status), /sensitive-link/);
});

test("ASC errors show only the operation, HTTP status and error code", async () => {
	const get = appStoreConnectApi("unused-token", async () =>
		Response.json(
			{ errors: [{ code: "ENTITY_ERROR.RELATIONSHIP.INVALID", detail: "PRIVATE-PASSWORD" }] },
			{ status: 409 },
		),
	);
	await assert.rejects(get("Read group assignment", "/v1/unused"), {
		message: "Read group assignment: HTTP 409 ENTITY_ERROR.RELATIONSHIP.INVALID",
	});
});
