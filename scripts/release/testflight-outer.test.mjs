import assert from "node:assert/strict";
import { test } from "node:test";
import { appStoreConnectApi, testFlightStatus } from "./testflight-outer.mjs";

function fixture({ submit = false } = {}) {
	const bundleId = "net.yonderbot.app";
	const buildNumber = submit ? "26112604" : "26112603";
	const posts = [];
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
		const { pathname, searchParams } = new URL(url);
		if (options.method === "POST") {
			assert.equal(submit, true);
			posts.push([pathname, JSON.parse(options.body).data]);
			return pathname.endsWith("relationships/builds")
				? new Response(null, { status: 204 })
				: Response.json({ data: { attributes: { betaReviewState: "WAITING_FOR_REVIEW" } } }, { status: 201 });
		}
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
							relationships: { betaGroups: { data: submit ? [] : [{ type: "betaGroups", id: group.id }] } },
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
				return Response.json({
					data: { attributes: { externalBuildState: submit ? "READY_FOR_BETA_SUBMISSION" : "IN_BETA_TESTING" } },
				});
			case "/v1/betaAppReviewSubmissions":
				assert.equal(searchParams.get("filter[build]"), "exact-build");
				assert.equal(searchParams.get("fields[betaAppReviewSubmissions]"), "betaReviewState");
				return Response.json({ data: submit ? [] : [{ attributes: { betaReviewState: "APPROVED" } }] });
			default:
				assert.fail(`Unexpected API call: ${pathname}`);
		}
	});
	return { posts, get, input: { bundleId, buildNumber, submit } };
}

test("probe filters for the exact iOS build and reports only sanitized public group status", async () => {
	const { posts, get, input } = fixture();
	const status = await testFlightStatus(get, input);
	assert.deepEqual(posts, []);
	assert.equal(status.buildNumber, input.buildNumber);
	assert.equal(status.audience, "APP_STORE_ELIGIBLE");
	assert.equal(status.assigned, true);
	assert.equal(status.review, "APPROVED");
	assert.equal(status.publicLinkEnabled, true);
	assert.equal(status.publicLinkLimit, 20);
	assert.doesNotMatch(JSON.stringify(status), /sensitive-link/);
});

test("submission recovery only writes the eligible approved target build", async () => {
	const { posts, get, input } = fixture({ submit: true });
	await assert.rejects(testFlightStatus(get, { ...input, buildNumber: "26112603" }), /limited to/);
	const status = await testFlightStatus(get, input);
	const exact = { type: "builds", id: "exact-build" };
	assert.deepEqual(posts, [
		["/v1/betaGroups/public-group/relationships/builds", [exact]],
		["/v1/betaAppReviewSubmissions", { type: "betaAppReviewSubmissions", relationships: { build: { data: exact } } }],
	]);
	assert.deepEqual(status.recovery, { assignment: "ACCEPTED", review: "WAITING_FOR_REVIEW" });
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
	await assert.rejects(get("Submit exact build", "/v1/unused", { data: {} }), {
		message:
			"Submit exact build: HTTP 409 ENTITY_ERROR.RELATIONSHIP.INVALID; Apple gave no recognized validation reason",
	});
});
