// Release builds inject the public updater key without writing a placeholder into the repository.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseVersion } from "./version.mjs";

export function decodeBase64(value, description) {
	if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
		throw new Error(`${description} 不是有效的 base64`);
	}
	return Buffer.from(value, "base64");
}

export function updaterPublicKey(value) {
	const pubkey = value?.trim();
	if (!pubkey) throw new Error("缺少 TAURI_UPDATER_PUBKEY");
	const lines = decodeBase64(pubkey, "TAURI_UPDATER_PUBKEY").toString("utf8").trim().split(/\r?\n/);
	const key = decodeBase64(lines[1], "updater 公钥");
	if (
		!lines[0]?.startsWith("untrusted comment:") ||
		key.length !== 42 ||
		key[0] !== 0x45 ||
		![0x44, 0x64].includes(key[1])
	) {
		throw new Error("TAURI_UPDATER_PUBKEY 不是 Tauri 公钥");
	}
	return pubkey;
}

export function updaterConfig({ pubkey, version, windowsSigningThumbprint, windowsSigningTimestampUrl }) {
	if (!parseVersion(version)) throw new Error(`版本号不合法：${version}`);
	const config = { version, plugins: { updater: { pubkey: updaterPublicKey(pubkey) } } };
	const certificateThumbprint = windowsSigningThumbprint?.trim().toUpperCase();
	const timestampUrl = windowsSigningTimestampUrl?.trim();
	if (!certificateThumbprint && !timestampUrl) return config;
	if (!/^[A-F0-9]{40}$/.test(certificateThumbprint ?? "")) {
		throw new Error("WINDOWS_SIGNING_CERTIFICATE_THUMBPRINT 必须是 40 位十六进制证书指纹");
	}
	const timestamp = URL.parse(timestampUrl ?? "");
	if (
		!timestamp ||
		!["https:", "http:"].includes(timestamp.protocol) ||
		timestamp.username ||
		timestamp.password ||
		timestamp.hash
	) {
		throw new Error("WINDOWS_SIGNING_TIMESTAMP_URL 必须是有效的 HTTP 或 HTTPS RFC 3161 地址");
	}
	return {
		...config,
		bundle: {
			windows: {
				certificateThumbprint,
				digestAlgorithm: "sha256",
				timestampUrl: timestamp.href,
				tsp: true,
				nsis: { installerHooks: "nsis/verify-authenticode.nsh" },
			},
		},
	};
}

function main(argv) {
	const flag = (name) => argv[argv.indexOf(name) + 1];
	try {
		if (!argv.includes("--output") || !argv.includes("--version")) throw new Error("需要 --output 和 --version");
		const config = updaterConfig({
			pubkey: process.env.TAURI_UPDATER_PUBKEY,
			version: flag("--version"),
			windowsSigningThumbprint: process.env.WINDOWS_SIGNING_CERTIFICATE_THUMBPRINT,
			windowsSigningTimestampUrl: process.env.WINDOWS_SIGNING_TIMESTAMP_URL,
		});
		writeFileSync(flag("--output"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
