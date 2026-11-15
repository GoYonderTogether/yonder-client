import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../preview/dist", import.meta.url));
const backendPort = Number(process.env.YONDER_PREVIEW_BACKEND_PORT || 8097);
const mime = {
	".js": "application/javascript",
	".css": "text/css",
	".html": "text/html",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
};
const server = http.createServer((req, res) => {
	if (/^\/(v1|files)(\/|$)/.test(req.url)) {
		const upstream = http.request(
			{
				host: "127.0.0.1",
				port: backendPort,
				path: req.url,
				method: req.method,
				headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
			},
			(reply) => {
				res.writeHead(reply.statusCode, reply.headers);
				reply.pipe(res);
			},
		);
		upstream.on("error", () => {
			res.writeHead(502);
			res.end("Local QA backend unavailable");
		});
		req.pipe(upstream);
		return;
	}
	let relative;
	try {
		relative = decodeURIComponent(new URL(req.url, "http://127.0.0.1:8098").pathname);
	} catch {
		res.writeHead(400);
		res.end();
		return;
	}
	let file = path.resolve(root, `.${relative}`);
	if (file !== root && !file.startsWith(root + path.sep)) {
		res.writeHead(403);
		res.end();
		return;
	}
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
	if (!fs.existsSync(file)) {
		res.writeHead(503);
		res.end("Preview build pending");
		return;
	}
	res.writeHead(200, {
		"content-type": mime[path.extname(file)] || "application/octet-stream",
		"cache-control": "no-store",
	});
	fs.createReadStream(file).pipe(res);
});
server.on("upgrade", (req, socket, head) => {
	const upstream = net.connect(backendPort, "127.0.0.1", () => {
		upstream.write(
			`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries({
				...req.headers,
				host: `127.0.0.1:${backendPort}`,
			})
				.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
				.join("\r\n")}\r\n\r\n`,
		);
		if (head.length) upstream.write(head);
		socket.pipe(upstream);
		upstream.pipe(socket);
	});
	upstream.on("error", () => socket.destroy());
	socket.on("error", () => upstream.destroy());
});
server.listen(8098, "127.0.0.1", () =>
	console.log(`Taro H5 development preview: http://127.0.0.1:8098 → local backend ${backendPort}`),
);
