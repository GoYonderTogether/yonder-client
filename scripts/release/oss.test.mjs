import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
	authorization,
	canonicalizedOssHeaders,
	canonicalizedResource,
	contentMd5,
	httpDate,
	PUBLIC_BASE_URL,
	REGION_ENDPOINT,
	readCredentials,
	signatureV1,
	signedHeaders,
	stringToSign,
} from "./oss.mjs";

test("CanonicalizedOSSHeaders 只取 x-oss-*、小写、字典序、末尾换行", () => {
	assert.equal(canonicalizedOssHeaders({}), "");
	assert.equal(
		canonicalizedOssHeaders({
			"X-OSS-Meta-Author": "alice",
			"x-oss-meta-magic": "abracadabra",
			"Content-Type": "text/html",
		}),
		"x-oss-meta-author:alice\nx-oss-meta-magic:abracadabra\n",
	);
	// 冒号两侧空白去掉
	assert.equal(canonicalizedOssHeaders({ "x-oss-meta-author": "  alice  " }), "x-oss-meta-author:alice\n");
});

test("CanonicalizedResource 是 /bucket/object，空对象为 /bucket/", () => {
	assert.equal(canonicalizedResource("yonder-release", "android/latest.json"), "/yonder-release/android/latest.json");
	assert.equal(canonicalizedResource("yonder-release"), "/yonder-release/");
});

test("StringToSign 按 V1 的六段结构拼接", () => {
	const resource = canonicalizedResource("oss-example", "nelson");
	assert.equal(
		stringToSign({
			method: "put",
			contentMd5: "eB5eJF1ptWaXm4bijSPyxw==",
			contentType: "text/html",
			date: "Thu, 17 Nov 2005 18:49:58 GMT",
			ossHeaders: { "x-oss-meta-author": "foo@bar.com" },
			resource,
		}),
		"PUT\neB5eJF1ptWaXm4bijSPyxw==\ntext/html\nThu, 17 Nov 2005 18:49:58 GMT\nx-oss-meta-author:foo@bar.com\n/oss-example/nelson",
	);
	// 没有 x-oss-* 头时第四段后面直接接资源，不产生空行
	assert.equal(
		stringToSign({ method: "GET", date: "Thu, 17 Nov 2005 18:49:58 GMT", resource: "/oss-example/" }),
		"GET\n\n\nThu, 17 Nov 2005 18:49:58 GMT\n/oss-example/",
	);
});

test("Signature V1 是 HMAC-SHA1 的 base64", () => {
	// 阿里云文档 V1 示例的 StringToSign 与 AccessKeySecret（示例密钥，不是真实凭据）
	const toSign = [
		"PUT",
		"ODBGOERFMDMzQTczRUY3NUE3NzA5QzdFNUYzMDQxNEM=",
		"text/html",
		"Wed, 28 Dec 2022 10:27:41 GMT",
		"x-oss-meta-magic:abracadabra",
		"x-oss-meta-author:alice",
		"/oss-example/nelson",
	].join("\n");
	assert.equal(signatureV1("yourAccessKeySecret", toSign), "hLqW6n+vFupta5BtQRQaQL674x4=");
});

test("signedHeaders 覆盖 Date、Content-MD5、Content-Type 与 x-oss-*，并给出 Authorization", () => {
	const body = Buffer.from("hello");
	const headers = signedHeaders({
		method: "PUT",
		key: "android/latest.json",
		body,
		contentType: "application/json",
		ossHeaders: { "x-oss-object-acl": "public-read" },
		credentials: { accessKeyId: "id", accessKeySecret: "secret" },
		date: "Wed, 01 Nov 2026 00:00:00 GMT",
	});
	assert.equal(headers.Date, "Wed, 01 Nov 2026 00:00:00 GMT");
	assert.equal(headers["Content-Type"], "application/json");
	assert.equal(headers["Content-MD5"], createHash("md5").update(body).digest("base64"));
	assert.equal(headers["x-oss-object-acl"], "public-read");
	const expected = signatureV1(
		"secret",
		stringToSign({
			method: "PUT",
			contentMd5: contentMd5(body),
			contentType: "application/json",
			date: "Wed, 01 Nov 2026 00:00:00 GMT",
			ossHeaders: { "x-oss-object-acl": "public-read" },
			resource: "/yonder-release/android/latest.json",
		}),
	);
	assert.equal(headers.Authorization, authorization("id", expected));
	assert.match(headers.Authorization, /^OSS id:[A-Za-z0-9+/=]+$/);
	// 不带 body 的 GET 不写 Content-MD5
	const get = signedHeaders({
		method: "GET",
		key: "android/latest.json",
		credentials: { accessKeyId: "id", accessKeySecret: "secret" },
		date: "Wed, 01 Nov 2026 00:00:00 GMT",
	});
	assert.equal(get["Content-MD5"], undefined);
	assert.equal(get["Content-Type"], undefined);
});

test("httpDate 用 RFC 1123（UTC）", () => {
	assert.equal(httpDate(new Date("2026-11-01T00:00:00Z")), "Sun, 01 Nov 2026 00:00:00 GMT");
});

test("凭据缺失时报错，不用空串或默认值继续", () => {
	assert.deepEqual(
		readCredentials({ ALIBABA_CLOUD_ACCESS_KEY_ID: " id ", ALIBABA_CLOUD_ACCESS_KEY_SECRET: " secret " }),
		{ accessKeyId: "id", accessKeySecret: "secret" },
	);
	assert.throws(() => readCredentials({}), /ALIBABA_CLOUD_ACCESS_KEY_ID/);
	assert.throws(() => readCredentials({ ALIBABA_CLOUD_ACCESS_KEY_ID: "id" }), /ALIBABA_CLOUD_ACCESS_KEY_SECRET/);
	assert.throws(
		() => readCredentials({ ALIBABA_CLOUD_ACCESS_KEY_ID: " ", ALIBABA_CLOUD_ACCESS_KEY_SECRET: "s" }),
		/缺少/,
	);
});

test("上传和公开下载使用不同域名", () => {
	assert.equal(REGION_ENDPOINT, "https://yonder-release.oss-cn-hangzhou.aliyuncs.com");
	assert.equal(PUBLIC_BASE_URL, "https://dl.zethai.cn");
});

test("sendWithRetry retries timeouts and 5xx, not 4xx", async () => {
	const { sendWithRetry } = await import("./oss.mjs");
	const request = { method: "PUT", url: "https://example/x", headers: {} };
	const timeout = Object.assign(new Error("PUT https://example/x 超时"), { retryable: true });

	let attempts = 0;
	const logs = [];
	const ok = await sendWithRetry(request, {
		log: (line) => logs.push(line),
		send: async () => {
			attempts += 1;
			if (attempts < 3) throw timeout;
			return { status: 200, headers: {}, body: Buffer.alloc(0) };
		},
	});
	assert.equal(ok.status, 200);
	assert.equal(attempts, 3);
	assert.equal(logs.length, 2);

	let calls = 0;
	const afterRetry = await sendWithRetry(request, {
		log: () => {},
		send: async () => {
			calls += 1;
			return { status: calls < 3 ? 503 : 200, headers: {}, body: Buffer.alloc(0) };
		},
	});
	assert.equal(afterRetry.status, 200);
	assert.equal(calls, 3);
	const giveUp = await sendWithRetry(request, {
		log: () => {},
		send: async () => ({ status: 503, headers: {}, body: Buffer.alloc(0) }),
	});
	assert.equal(giveUp.status, 503);

	let denied = 0;
	const forbidden = Object.assign(new Error("PUT 失败：HTTP 403"), { status: 403 });
	await assert.rejects(
		sendWithRetry(request, {
			log: () => {},
			send: async () => {
				denied += 1;
				throw forbidden;
			},
		}),
		/403/,
	);
	assert.equal(denied, 1);
});

test("PUT signs every retry again so an old request cannot expire", async () => {
	const { putObject } = await import("./oss.mjs");
	const requests = [];
	let now = Date.parse("2026-11-15T00:00:00Z");
	const RealDate = Date;
	class TestDate extends RealDate {
		constructor(...args) {
			super(...(args.length ? args : [now]));
		}
	}
	globalThis.Date = TestDate;
	try {
		await putObject({
			key: "android/test.apk",
			body: Buffer.from("apk"),
			credentials: { accessKeyId: "id", accessKeySecret: "secret" },
			sendImpl: async (request) => {
				requests.push(request);
				if (requests.length < 3) throw Object.assign(new Error("timeout"), { retryable: true });
				return { status: 200, headers: {}, body: Buffer.alloc(0) };
			},
			sleepImpl: async () => {
				now += 60_000;
			},
		});
	} finally {
		globalThis.Date = RealDate;
	}
	assert.equal(requests.length, 3);
	assert.deepEqual(
		requests.map((request) => request.headers.Date),
		["Sun, 15 Nov 2026 00:00:00 GMT", "Sun, 15 Nov 2026 00:01:00 GMT", "Sun, 15 Nov 2026 00:02:00 GMT"],
	);
	assert.equal(requests[0].headers.Authorization !== requests[1].headers.Authorization, true);
	for (const request of requests) assert.ok(request.body.equals(Buffer.from("apk")));
});

test("APK multipart retries only the interrupted part and completes in order", async () => {
	const { putObject } = await import("./oss.mjs");
	const size = 2 * 1024 * 1024;
	const calls = [];
	await putObject({
		key: "android/test.apk",
		body: Buffer.alloc(size + 7, 42),
		multipart: true,
		credentials: { accessKeyId: "id", accessKeySecret: "test" },
		sleepImpl: async () => {},
		sendImpl: async (request) => {
			const query = new URL(request.url).search;
			calls.push([request.method, query]);
			if (query === "?uploads") {
				return { status: 200, body: Buffer.from("<UploadId>test-id</UploadId>") };
			}
			assert.equal(request.headers["Content-Length"], request.body.length);
			if (request.method === "PUT") {
				assert.equal(request.body.length, query.startsWith("?partNumber=1") ? size : 7);
				if (calls.length === 3) throw Object.assign(new Error("timeout"), { retryable: true });
				return { status: 200, headers: { etag: `"${"a".repeat(32)}"` } };
			}
			assert.ok(request.body.toString().indexOf("<PartNumber>1") < request.body.toString().indexOf("<PartNumber>2"));
			return { status: 200, body: Buffer.from("<CompleteMultipartUploadResult>") };
		},
	});
	assert.deepEqual(calls, [
		["POST", "?uploads"],
		["PUT", "?partNumber=1&uploadId=test-id"],
		["PUT", "?partNumber=2&uploadId=test-id"],
		["PUT", "?partNumber=2&uploadId=test-id"],
		["POST", "?uploadId=test-id"],
	]);
});

test("an HTTP error stops the upload without an unhandled EPIPE", async () => {
	const https = await import("node:https");
	const { putObject } = await import("./oss.mjs");
	const certificate = process.env.YONDER_TEST_TLS_CERTIFICATE;
	const privateKey = process.env.YONDER_TEST_TLS_PRIVATE_KEY;
	if (!certificate || !privateKey) return;
	const server = https.createServer({ cert: certificate, key: privateKey }, (_request, response) => {
		response.writeHead(403, { "content-type": "text/plain" });
		response.end("denied");
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	try {
		const address = server.address();
		await assert.rejects(
			putObject({
				key: "android/test.apk",
				body: Buffer.alloc(2_000_000),
				credentials: { accessKeyId: "id", accessKeySecret: "secret" },
				endpoint: `https://127.0.0.1:${address.port}`,
			}),
			/HTTP 403/,
		);
	} finally {
		delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
		await new Promise((resolve) => server.close(resolve));
	}
});
