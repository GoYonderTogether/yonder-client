// 阿里云 OSS 发布产物上传：用 node:crypto 手写 Signature V1，不引入 SDK。
// 凭据只从环境变量读取，缺失就报错退出，不写死、不落盘、不打印。
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { request } from "node:https";
import { fileURLToPath } from "node:url";

export const BUCKET = "yonder-release";
export const REGION_ENDPOINT = `https://${BUCKET}.oss-cn-hangzhou.aliyuncs.com`;

/** 发布产物的公开读取地址；清单与 APK 都由它拼出。 */
export const PUBLIC_BASE_URL = "https://dl.zethai.cn";

/** RFC 1123 时间，OSS 的 Date 头只接受这一种格式。 */
export function httpDate(date = new Date()) {
	return date.toUTCString();
}

/** `x-oss-*` 头按名字字典序排列，名字小写、冒号后不留空格，整体以换行结尾。 */
export function canonicalizedOssHeaders(headers = {}) {
	const entries = Object.entries(headers)
		.map(([name, value]) => [name.toLowerCase(), String(value).trim()])
		.filter(([name]) => name.startsWith("x-oss-"))
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
	return entries.length === 0 ? "" : `${entries.map(([name, value]) => `${name}:${value}`).join("\n")}\n`;
}

/** `/bucket/object`；对象为空时按 OSS 规则是 `/bucket/`。 */
export function canonicalizedResource(bucket, key = "") {
	return `/${bucket}/${key}`;
}

/**
 * Signature V1 的 StringToSign：
 * `VERB\nContent-MD5\nContent-Type\nDate\nCanonicalizedOSSHeaders CanonicalizedResource`
 */
export function stringToSign({ method, contentMd5 = "", contentType = "", date, ossHeaders = {}, resource }) {
	const verb = String(method).toUpperCase();
	return [verb, contentMd5, contentType, date, `${canonicalizedOssHeaders(ossHeaders)}${resource}`].join("\n");
}

export function signatureV1(accessKeySecret, toSign) {
	return createHmac("sha1", accessKeySecret).update(toSign, "utf8").digest("base64");
}

export function contentMd5(body) {
	return createHash("md5").update(body).digest("base64");
}

export function authorization(accessKeyId, signature) {
	return `OSS ${accessKeyId}:${signature}`;
}

/** 凭据只认这两个环境变量；缺任何一个都直接失败，不用默认值或空串继续。 */
export function readCredentials(env = process.env) {
	const accessKeyId = env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
	const accessKeySecret = env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();
	if (!accessKeyId || !accessKeySecret) {
		throw new Error("缺少 ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET；OSS 上传不提供默认凭据");
	}
	return { accessKeyId, accessKeySecret };
}

/** 一次 OSS 请求的完整签名头；纯函数，测试与请求共用同一份计算。 */
export function signedHeaders({
	method,
	key,
	query = "",
	body,
	contentType,
	ossHeaders = {},
	credentials,
	bucket = BUCKET,
	date,
}) {
	const headers = {
		Date: date ?? httpDate(),
		...(contentType ? { "Content-Type": contentType } : {}),
		...(body ? { "Content-MD5": contentMd5(body) } : {}),
		...(body ? { "Content-Length": body.length } : {}),
		...ossHeaders,
	};
	const signature = signatureV1(
		credentials.accessKeySecret,
		stringToSign({
			method,
			contentMd5: headers["Content-MD5"] ?? "",
			contentType: headers["Content-Type"] ?? "",
			date: headers.Date,
			ossHeaders: headers,
			resource: canonicalizedResource(bucket, key) + query,
		}),
	);
	return { ...headers, Authorization: authorization(credentials.accessKeyId, signature) };
}

const IDLE_TIMEOUT_MS = 180_000;
const RETRY_DELAYS_MS = [2_000, 8_000, 20_000];

function send({ method, url, headers, body, requestImpl = request }) {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		let done = false;
		const finish = (callback, value) => {
			if (done) return;
			done = true;
			callback(value);
		};
		const req = requestImpl(
			{
				method,
				protocol: target.protocol,
				hostname: target.hostname,
				port: target.port || undefined,
				path: `${target.pathname}${target.search}`,
				headers,
			},
			(res) => {
				const chunks = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("error", (error) => finish(reject, error));
				res.on("end", () =>
					finish(resolve, { status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
				);
				// A 403 can arrive while the installer body is still uploading. Stop writing immediately,
				// otherwise Node reports an unhandled EPIPE on the socket and loses the upstream error.
				if ((res.statusCode ?? 0) >= 400) req.destroy();
			},
		);
		req.on("error", (error) => finish(reject, error));
		req.on("socket", (socket) => socket.on("error", (error) => finish(reject, error)));
		// 上传几十兆的安装包时，握手和排空都可能超过一分钟（2026-11-13 安卓 APK 上传就是卡在这里超时）；
		// 空闲超时只说明连接没有进展，真正失败靠重试兜住。
		req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(timeoutError(method, url)));
		if (body) req.end(body);
		else req.end();
	});
}

/** 连接没进展、或 OSS 明确回了 5xx 才算可重试；4xx 是签名或权限问题，重试也没用。 */
function isRetryable(error) {
	if (error?.retryable === true) return true;
	const status = error?.status;
	return typeof status === "number" && status >= 500;
}

function timeoutError(method, url) {
	const error = new Error(`${method} ${url} 超时`);
	error.retryable = true;
	return error;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** PUT 与 GET 都走这里：最多试四次，间隔逐渐拉长，日志只说第几次、不打印 URL 和凭据。 */
export async function sendWithRetry(
	request_,
	{ attempts = RETRY_DELAYS_MS.length + 1, log = console.log, send: sendImpl = send, sleep: sleepImpl = sleep } = {},
) {
	for (let attempt = 1; ; attempt += 1) {
		try {
			const request = typeof request_ === "function" ? request_() : request_;
			const response = await sendImpl(request);
			if (response.status >= 500 && attempt < attempts) {
				const error = new Error(`服务端返回 HTTP ${response.status}`);
				error.status = response.status;
				throw error;
			}
			return response;
		} catch (error) {
			if (attempt >= attempts || !isRetryable(error)) throw error;
			log(`${error.message}；第 ${attempt} 次失败，${RETRY_DELAYS_MS[attempt - 1] / 1000} 秒后重试`);
			await sleepImpl(RETRY_DELAYS_MS[attempt - 1]);
		}
	}
}

function objectUrl(key, endpoint) {
	return `${endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Every attempt gets a fresh signed Date: a slow cross-border upload can outlive the first
 * signature's allowed skew, so retrying the same Authorization produces RequestTimeTooSkewed.
 */
export async function putObject({
	key,
	body,
	contentType = "application/octet-stream",
	credentials,
	ossHeaders = {},
	bucket = BUCKET,
	endpoint = REGION_ENDPOINT,
	multipart = false,
	// Tests inject transport only; production always uses the pinned HTTPS request above.
	sendImpl = send,
	sleepImpl = sleep,
}) {
	async function write(method, query, body, contentType, ossHeaders, status = 200) {
		const response = await sendWithRetry(
			() => ({
				method,
				url: objectUrl(key, endpoint) + query,
				body,
				headers: signedHeaders({ method, key, query, body, contentType, ossHeaders, credentials, bucket }),
			}),
			{ send: sendImpl, sleep: sleepImpl },
		);
		if (response.status !== status) {
			const code = /<Code>([A-Za-z]+)<\/Code>/.exec(response.body.toString())?.[1];
			throw new Error(`${method} ${key} 失败：HTTP ${response.status}${code ? ` ${code}` : ""}`);
		}
		return response;
	}
	const partSize = 2 * 1024 * 1024;
	if (!multipart || body.length <= partSize) return write("PUT", "", body, contentType, ossHeaders);

	const init = await write("POST", "?uploads", undefined, contentType, ossHeaders);
	const uploadId = /<UploadId>([\w-]+)<\/UploadId>/.exec(init.body.toString())?.[1];
	if (!uploadId) throw new Error(`OSS 未返回 ${key} 的 UploadId`);
	const query = `uploadId=${uploadId}`;
	try {
		const parts = [];
		for (let offset = 0; offset < body.length; offset += partSize) {
			const number = parts.length + 1;
			const part = body.subarray(offset, offset + partSize);
			const response = await write("PUT", `?partNumber=${number}&${query}`, part);
			const etag = response.headers.etag;
			if (!/^"[a-f0-9]{32}"$/i.test(etag)) throw new Error(`OSS 未返回 ${key} 第 ${number} 片的 ETag`);
			parts.push(`<Part><PartNumber>${number}</PartNumber><ETag>${etag}</ETag></Part>`);
		}
		const xml = Buffer.from(`<CompleteMultipartUpload>${parts.join("")}</CompleteMultipartUpload>`);
		const result = await write("POST", `?${query}`, xml, "application/xml");
		if (!/<CompleteMultipartUploadResult[\s>]/.test(result.body.toString())) {
			throw new Error(`OSS 未确认 ${key} 分片上传完成`);
		}
		return result;
	} catch (error) {
		try {
			await write("DELETE", `?${query}`, undefined, undefined, undefined, 204);
		} catch (abortError) {
			throw new Error(`${error.message}；分片清理失败：${abortError.message}`);
		}
		throw error;
	}
}

export async function getPublicReleaseObject(key) {
	const response = await sendWithRetry({ method: "GET", url: objectUrl(key, PUBLIC_BASE_URL) });
	if (response.status !== 200) throw new Error(`公开下载 ${key} 失败：HTTP ${response.status}`);
	return response.body;
}

/** 读对象；不存在（404）返回 null，其它错误直接抛出并带上 OSS 的错误码。 */
export async function getObject({ key, credentials, bucket = BUCKET, endpoint = REGION_ENDPOINT }) {
	const headers = signedHeaders({ method: "GET", key, credentials, bucket });
	const response = await sendWithRetry({ method: "GET", url: objectUrl(key, endpoint), headers });
	if (response.status === 404) return null;
	if (response.status !== 200) {
		throw new Error(`GET ${key} 失败：HTTP ${response.status} ${response.body.toString("utf8").slice(0, 300)}`);
	}
	return response.body;
}

const CONTENT_TYPES = {
	".dmg": "application/x-apple-diskimage",
	".exe": "application/vnd.microsoft.portable-executable",
	".deb": "application/vnd.debian.binary-package",
	".appimage": "application/octet-stream",
	".apk": "application/vnd.android.package-archive",
};

/** 桌面与安卓安装包的内容类型；未知后缀按二进制流。 */
export function contentTypeFor(file) {
	const dot = file.lastIndexOf(".");
	return (dot >= 0 ? CONTENT_TYPES[file.slice(dot)] : undefined) ?? "application/octet-stream";
}

function main(argv) {
	const flag = (name) => {
		const index = argv.indexOf(name);
		return index === -1 ? undefined : (argv[index + 1] ?? "");
	};
	try {
		const credentials = readCredentials();
		const key = flag("--key");
		if (!key) throw new Error("--key 必填");
		if (argv.includes("--put")) {
			const file = flag("--file");
			if (!file) throw new Error("--put 需要 --file");
			const put = putObject({
				key,
				body: readFileSync(file),
				contentType: flag("--content-type") || contentTypeFor(file),
				credentials,
				ossHeaders: argv.includes("--public-read") ? { "x-oss-object-acl": "public-read" } : {},
			});
			return put.then(
				() => {
					console.log(`已上传 ${key}`);
					return 0;
				},
				(error) => {
					console.error(error.message);
					return 1;
				},
			);
		}
		if (argv.includes("--get")) {
			return getObject({ key, credentials }).then(
				(body) => {
					if (body === null) {
						console.error(`${key} 不存在`);
						return 1;
					}
					process.stdout.write(body);
					return 0;
				},
				(error) => {
					console.error(error.message);
					return 1;
				},
			);
		}
		console.error(
			"用法：oss.mjs --put --key <key> --file <path> [--content-type <type>] [--public-read] | --get --key <key>",
		);
		return 2;
	} catch (error) {
		console.error(error.message);
		return 1;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	Promise.resolve(main(process.argv.slice(2))).then((code) => {
		process.exitCode = code;
	});
}
