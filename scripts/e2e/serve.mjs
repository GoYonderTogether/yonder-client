#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
/**
 * The server the end-to-end test runs against: one origin serving the built web app, the API, the
 * realtime socket and the dev file route. That is the same shape a deployment has (one origin, no
 * CORS, cookies work), which is why the test can use a real browser without any test-only switch.
 *
 * It starts the cloud server from `apps/cloud` in-process, then proxies `/v1`, `/files` and `/api`
 * to it and serves `apps/web/dist` for everything else.
 */
import { createServer, request as httpRequest } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = join(ROOT, "apps/web/dist");
const PORT = Number(process.env.E2E_PORT ?? 4180);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8090);
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;

if (!existsSync(join(DIST, "index.html"))) {
	console.error("apps/web/dist is missing; run `npm run build` first");
	process.exit(1);
}

const CONTENT_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".json": "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".woff2": "font/woff2",
};

const server = createServer((incoming, outgoing) => {
	const url = new URL(incoming.url ?? "/", `http://127.0.0.1:${PORT}`);

	if (url.pathname.startsWith("/v1") || url.pathname.startsWith("/files") || url.pathname.startsWith("/api")) {
		proxy(incoming, outgoing, url);
		return;
	}

	void serveStatic(url.pathname, outgoing);
});

function proxy(incoming, outgoing, url) {
	const target = new URL(url.pathname + url.search, API_ORIGIN);
	const headers = { ...incoming.headers, host: `127.0.0.1:${API_PORT}` };
	const upstream = httpRequest(
		{
			hostname: target.hostname,
			port: target.port,
			path: target.pathname + target.search,
			method: incoming.method,
			headers,
		},
		(response) => {
			outgoing.writeHead(response.statusCode ?? 502, response.headers);
			response.pipe(outgoing);
		},
	);
	// A browser that closes a tab mid-request resets the connection; that ends this request only.
	incoming.on("error", () => upstream.destroy());
	upstream.on("error", () => {
		outgoing.writeHead(502, { "content-type": "application/json" });
		outgoing.end(JSON.stringify({ error: { code: "internal", message: "the API server is not running" } }));
	});
	incoming.pipe(upstream);
}

// The realtime channel is a WebSocket; the same proxy has to carry the upgrade.
server.on("upgrade", (incoming, socket, head) => {
	// Closing a browser context resets its sockets. Without these handlers the reset is an
	// uncaught error and takes the whole test server down, failing every test after it.
	socket.on("error", () => socket.destroy());
	const url = new URL(incoming.url ?? "/", `http://127.0.0.1:${PORT}`);
	const upstream = httpRequest({
		hostname: "127.0.0.1",
		port: API_PORT,
		path: url.pathname + url.search,
		method: incoming.method,
		headers: { ...incoming.headers, host: `127.0.0.1:${API_PORT}` },
	});
	upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
		socket.write(
			`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers)
				.map(([name, value]) => `${name}: ${value}`)
				.join("\r\n")}\r\n\r\n`,
		);
		if (upstreamHead.length > 0) socket.write(upstreamHead);
		upstreamSocket.on("error", () => socket.destroy());
		socket.on("close", () => upstreamSocket.destroy());
		socket.pipe(upstreamSocket);
		upstreamSocket.pipe(socket);
	});
	upstream.on("response", (response) => {
		socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n\r\n`);
		socket.destroy();
	});
	upstream.on("error", () => socket.destroy());
	if (head.length > 0) upstream.write(head);
	upstream.end();
});

async function serveStatic(pathname, outgoing) {
	const relative = normalize(decodeURIComponent(pathname)).replace(/^\/+/, "");
	const candidate = resolve(DIST, relative);
	const insideDist = candidate === DIST || candidate.startsWith(`${DIST}/`);
	// Anything that is not a real file is the app's own route; the router decides what to show.
	const file = insideDist && extname(candidate) !== "" ? candidate : join(DIST, "index.html");

	try {
		const body = await readFile(file);
		outgoing.writeHead(200, {
			"content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
			// Hashed asset names can be cached forever; index.html must not be.
			"cache-control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-store",
		});
		outgoing.end(body);
	} catch {
		outgoing.writeHead(404, { "content-type": "text/plain" });
		outgoing.end("not found");
	}
}

server.listen(PORT, "127.0.0.1", () => {
	console.log(`e2e server on http://127.0.0.1:${PORT} (api ${API_ORIGIN})`);
});
