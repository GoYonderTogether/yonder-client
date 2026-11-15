import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const foreground = globalThis.process.env.NATIVE_TEST_ALLOW_DISPLAY === "1";
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const helpers = [
	"const wait=async(predicate)=>{const end=Date.now()+25000;while(!predicate()){if(Date.now()>end)throw new Error('DOM condition timed out: '+location.pathname+' '+document.body.innerText.slice(0,180));await new Promise(r=>setTimeout(r,50));}};",
	"const button=(label)=>Array.from(document.querySelectorAll('button,[role=menuitem]')).find(el=>(el.getAttribute('aria-label')||el.textContent).trim()===label);",
	"const input=(selector,value)=>{const el=document.querySelector(selector);if(!el)throw new Error('Input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};",
	"const go=(path)=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));};",
].join("");

/** seed.json contains an isolated API session; never use a production session or OS keychain. */
export async function runNative({
	binary,
	root,
	peers,
	switchAccount,
	reportPath,
	originalAccount,
	platform = globalThis.process.platform,
	preferencesOnly = false,
}) {
	const process = spawn(binary, [], {
		env: { ...globalThis.process.env, NATIVE_TEST_ROOT: root },
		stdio: ["pipe", "pipe", "pipe"],
	});
	const deadline = setTimeout(
		() => process.kill("SIGTERM"),
		foreground ? 120000 : platform === "win32" ? 360000 : 180000,
	);
	const stderr = [];
	process.stderr.on("data", (data) => stderr.push(String(data)));
	const pending = new Map();
	let ready;
	const started = new Promise((resolve) => {
		ready = resolve;
	});
	createInterface({ input: process.stdout }).on("line", (line) => {
		let result;
		try {
			result = JSON.parse(line);
		} catch {
			return;
		}
		if (result.ready) ready();
		else if (result.id) {
			const request = pending.get(result.id);
			if (!request) return;
			pending.delete(result.id);
			if (result.ok) request.resolve(result.value);
			else request.reject(new Error(`${result.error} [${request.operation}]`));
		}
	});
	process.on("exit", (code) => {
		for (const request of pending.values())
			request.reject(new Error(`Native process exited: ${code} ${stderr.join("").slice(-1200)}`));
		pending.clear();
	});
	let sequence = 0;
	const command = (op, extra = {}) => {
		const id = String(++sequence);
		const response = new Promise((resolve, reject) =>
			pending.set(id, { resolve, reject, operation: `${op}:${extra.window ?? "main"}` }),
		);
		process.stdin.write(`${JSON.stringify({ id, op, ...extra })}\n`);
		let timer;
		const timed = new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`Native command timed out: ${op}`)), 45000);
		});
		return Promise.race([response, timed]).finally(() => clearTimeout(timer));
	};
	const evaluate = (body, window = "main") => command("eval", { window, source: `(async()=>{${helpers}${body}})()` });
	const report = {
		runtime:
			platform === "win32"
				? "real Tauri Wry / WebView2 in dedicated Windows QA guest"
				: foreground
					? "real foreground Tauri Wry / WKWebView"
					: "real Tauri Wry / WKWebView; display suppressed inside test process",
		createdAt: new Date().toISOString(),
		scenario: preferencesOnly ? "preferences-and-main-close" : "full",
		checks: [],
		sourceSha256: {},
	};
	const record = (name, evidence = true) => {
		report.checks.push({ name, evidence });
		console.log(`native check: ${name}`);
	};
	const snapshot = async (name, window = "main") => {
		if (!foreground || globalThis.process.platform !== "darwin") return;
		const state = await command("inspect", { window });
		const path = join(dirname(reportPath), `${name}.png`);
		try {
			await mkdir(dirname(path), { recursive: true });
			execFileSync("screencapture", ["-x", "-o", "-l", String(state.windowNumber), path], { stdio: "pipe" });
			record("native window screenshot", `${name}.png`);
		} catch {
			record("native screenshot unavailable", name);
		}
	};
	const open = async () => {
		await evaluate(
			"await wait(()=>button('New chat'));button('New chat').click();await wait(()=>button('Add contacts'));button('Add contacts').click();return true;",
		);
		let windows;
		for (let n = 0; n < 100; n++) {
			windows = await command("windows");
			if (windows.includes("add-contacts")) break;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert(windows.includes("add-contacts"));
		await evaluate("await wait(()=>document.querySelector('input'));return location.pathname;", "add-contacts");
	};
	const searchAndAdd = async (peer) => {
		await evaluate(
			"input('input'," +
				JSON.stringify(peer) +
				");button('Search').click();await wait(()=>document.body.innerText.includes(" +
				JSON.stringify(`@${peer}`) +
				"));await wait(()=>button('Add'));button('Add').click();await wait(()=>button('Message'));return {added:document.body.innerText.includes('Added')};",
			"add-contacts",
		);
	};
	try {
		await Promise.race([
			started,
			new Promise((_, reject) => setTimeout(() => reject(new Error("Native app did not start")), 30000)),
		]);
		if (platform === "win32") record("native main window responds before DOM evaluation", await command("inspect"));
		await evaluate(
			"await wait(()=>button('New chat'));return {origin:location.origin,desktop:!!window.__TAURI_INTERNALS__};",
		);
		record("signed-in real bundled client", await evaluate("return {origin:location.origin,path:location.pathname};"));
		if (!preferencesOnly) {
			const menu = await evaluate(
				"button('New chat').click();await wait(()=>document.querySelectorAll('[role=menuitem]').length===3);return Array.from(document.querySelectorAll('[role=menuitem]')).map(el=>el.textContent.trim());",
			);
			assert.deepEqual(menu, ["Create BOT", "Add contacts", "Start group chat"]);
			record("native menu ordering", menu);
			await snapshot("native-menu");
			const defaultBot = await evaluate(
				"button('Create BOT').click();await wait(()=>document.querySelector('[role=dialog] input'));const name=document.querySelector('[role=dialog] input').value;if(!name||button('Create').disabled)throw new Error('Default bot cannot be created');button('Create').click();await wait(()=>!document.querySelector('[role=dialog]')&&location.pathname.startsWith('/messages/'));return {name,path:location.pathname};",
			);
			record("native zero-edit default BOT creation enters its conversation", defaultBot);
			await open();
			const native = await command("inspect", { window: "add-contacts" });
			record("native window inspection", native);
			if (platform === "win32") {
				assert.equal(native.visible, true);
				assert.equal(native.resizable, false);
				assert.equal(native.minimizable, false);
				assert.equal(native.maximizable, false);
			} else {
				assert.deepEqual(native.buttonsHidden, [false, true, true]);
				if (foreground) {
					assert.equal(native.visible, true);
					assert.equal(native.key, true);
				} else {
					assert(native.x < -10000 || native.y < -10000, JSON.stringify(native));
					assert.equal(native.visible, false);
					assert(native.showRequests > 0);
				}
			}
			record("native window controls and host display state", native);
			await evaluate(
				"await window.__TAURI_INTERNALS__.invoke('open_add_contacts',{title:'Add contacts',query:''});return true;",
			);
			assert.equal((await command("windows")).filter((label) => label === "add-contacts").length, 1);
			record("repeat-open remains one native window");
			await searchAndAdd(peers[0]);
			record("native contact search and persistent add");
			await snapshot("native-contact-added", "add-contacts");
			const refreshes = await evaluate(
				"const ids=Array.from({length:8},()=>crypto.randomUUID());await Promise.all(ids.map(requestId=>window.__TAURI_INTERNALS__.invoke('request_main_session',{requestId})));await new Promise(r=>setTimeout(r,600));return window.__nativeEvidence;",
				"add-contacts",
			);
			assert.equal(refreshes.refreshRequests, 0);
			await evaluate("await wait(()=>button('New chat'));return true;");
			record("parallel auxiliary requests leave refresh rotation owned by main", {
				auxiliaryRefreshRequests: refreshes.refreshRequests,
			});
			await evaluate("go('/tasks');await wait(()=>location.pathname==='/tasks');return true;");
			await evaluate("setTimeout(()=>button('Message').click(),0);return true;", "add-contacts");
			const destination = await evaluate(
				"await wait(()=>location.pathname.startsWith('/messages/'));return location.pathname;",
			);
			assert(!(await command("windows")).includes("add-contacts"));
			const mainAfterMessage = await command("inspect");
			if (platform === "win32") {
				assert.equal(mainAfterMessage.visible, true);
				assert.equal(mainAfterMessage.focused, true);
			}
			record("Message from Tasks navigates main and closes auxiliary", { destination, main: mainAfterMessage });
			await open();
			await searchAndAdd(peers[1]);
			await evaluate("go('/me/account');await wait(()=>button('Sign out'));return true;");
			await evaluate("setTimeout(()=>button('Message').click(),0);return true;", "add-contacts");
			await evaluate("await wait(()=>location.pathname.startsWith('/messages/'));return true;");
			assert(!(await command("windows")).includes("add-contacts"));
			record("Message from Me navigates main and closes auxiliary");
			const group = await evaluate(
				"button('New chat').click();await wait(()=>button('Start group chat'));button('Start group chat').click();await wait(()=>document.querySelectorAll('[role=dialog] input[type=checkbox]').length>=2);const checks=document.querySelectorAll('[role=dialog] input[type=checkbox]');checks[0].click();checks[1].click();await wait(()=>!button('Done').disabled);button('Done').click();await wait(()=>!document.querySelector('[role=dialog]')&&location.pathname.startsWith('/messages/'));return {path:location.pathname};",
			);
			assert.deepEqual(await command("windows"), ["main"]);
			record("native group selection and creation stays in app overlay", group);
			await open();
			await evaluate(
				"go('/me/account');await wait(()=>button('Sign out'));button('Sign out').click();await wait(()=>location.pathname.startsWith('/sign-in'));return true;",
			);
			for (let n = 0; n < 100 && (await command("windows")).includes("add-contacts"); n++)
				await new Promise((resolve) => setTimeout(resolve, 50));
			assert(!(await command("windows")).includes("add-contacts"));
			record("real sign-out closes auxiliary window");
			const login = async (account) => {
				await evaluate(
					"await wait(()=>button('Sign in with a password'));button('Sign in with a password').click();await wait(()=>document.querySelector('input[type=password]'));input('input[type=tel]'," +
						JSON.stringify(account.target.slice(3)) +
						");input('input[type=password]'," +
						JSON.stringify(account.password) +
						");document.querySelector('input[type=checkbox]').click();await wait(()=>!button('Sign in').disabled);button('Sign in').click();await wait(()=>button('New chat'));return true;",
				);
			};
			if (switchAccount) {
				await login(switchAccount);
				await open();
				record("new account session can reopen an independently authenticated auxiliary");
				if (originalAccount) {
					await evaluate("go('/sign-in');await wait(()=>button('Sign in with a password'));return true;");
					await login(originalAccount);
					assert(!(await command("windows")).includes("add-contacts"));
					record("real account switch closes the previous account's auxiliary");
					await open();
				}
			}
		}
		await evaluate("await window.__TAURI_INTERNALS__.invoke('close_add_contacts');return true;");
		const expectedTheme = await evaluate(
			"go('/me/general');await wait(()=>document.querySelectorAll('button[data-group=theme]').length===3);const theme=matchMedia('(prefers-color-scheme:dark)').matches?'light':'dark';button(theme==='dark'?'Dark':'Light').click();await wait(()=>document.documentElement.dataset.theme===theme);const chinese=Array.from(document.querySelectorAll('button[data-group=locale]')).find(el=>el.textContent.includes('中文'));if(!chinese)throw new Error('Chinese language choice missing');chinese.click();await wait(()=>document.documentElement.lang==='zh-CN');go('/messages');await wait(()=>button('发起聊天'));return theme;",
		);
		record("real General settings select non-system theme and Chinese");
		await evaluate(
			"await wait(()=>button('发起聊天'));button('发起聊天').click();await wait(()=>button('添加好友'));button('添加好友').click();return true;",
		);
		for (let n = 0; n < 100 && !(await command("windows")).includes("add-contacts"); n++)
			await new Promise((r) => setTimeout(r, 50));
		const preferences = await evaluate(
			"await wait(()=>document.querySelector('input'));return {lang:document.documentElement.lang,theme:document.documentElement.dataset.theme,placeholder:document.querySelector('input').placeholder};",
			"add-contacts",
		);
		record("auxiliary preference observation", preferences);
		assert.equal(preferences.lang, "zh-CN");
		assert.equal(preferences.theme, expectedTheme);
		assert.equal(preferences.placeholder, "搜索 ID 或手机号");
		record("non-system language and theme propagate to auxiliary");
		await command("close");
		for (let n = 0; n < 100 && (await command("windows")).length; n++) await new Promise((r) => setTimeout(r, 50));
		assert.equal((await command("windows")).length, 0);
		record("closing main destroys its auxiliary");
		const paths = [
			"apps/desktop/src-tauri/src/contact_window.rs",
			"apps/web/src/lib/contact-window.ts",
			"apps/web/src/app/app.tsx",
			"packages/api-client/src/client.ts",
			"packages/ui/data/src/query/provider.tsx",
			"apps/web/src/app/app-frame.tsx",
		];
		for (const path of paths)
			report.sourceSha256[path] = createHash("sha256")
				.update(await readFile(resolve(REPO, path)))
				.digest("hex");
		await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
		return report;
	} catch (error) {
		report.failure = String(error);
		await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
		throw error;
	} finally {
		clearTimeout(deadline);
		if (process.exitCode === null && !process.killed) {
			process.stdin.write(`${JSON.stringify({ id: "quit", op: "quit" })}\n`);
			process.stdin.end();
			setTimeout(() => process.kill("SIGTERM"), 2000).unref();
		}
	}
}
