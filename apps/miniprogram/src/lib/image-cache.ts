import Taro from "@tarojs/taro";
import sha256 from "node-forge/lib/sha256.js";

const LIMIT = 80 * 1024 * 1024;
const MAX_FILES = 256;
// Keep the existing index and file paths so a client upgrade can reuse cached images.
const cacheNamespace = "yonder.mini.images.v1.";
const digest = (value: string) => {
	const hash = sha256.create();
	hash.update(encodeURIComponent(value));
	return hash.digest().toHex();
};
const root = () => `${Taro.env.USER_DATA_PATH}/yonder-images-v1`;
const preview = () => process.env.TARO_ENV === "h5";

interface MediaFile {
	path: string;
	bytes: number;
	used: number;
}

export function removeMediaFile(path: string): void {
	try {
		if (preview()) URL.revokeObjectURL(path);
		else Taro.getFileSystemManager().unlink({ filePath: path, fail() {} });
	} catch {
		// The host can have removed a temp file already.
	}
}

export function mediaCache(scope: string) {
	const id = cacheNamespace + digest(scope);
	const pending = new Map<string, Promise<string>>();
	const transient = new Map<string, string>();
	const readIndex = (): Record<string, MediaFile> => {
		try {
			return Taro.getStorageSync(id) || {};
		} catch {
			return {};
		}
	};
	const saveIndex = (index: Record<string, MediaFile>) => {
		try {
			Taro.setStorageSync(id, index);
			return true;
		} catch {
			// A full storage partition can still open the temporary file.
			return false;
		}
	};
	const keepTemporary = (key: string, path: string) => {
		if (transient.size === 32) {
			const oldest = transient.keys().next().value;
			if (oldest) remove((candidate) => candidate === oldest);
		}
		transient.set(key, path);
		return path;
	};
	const remove = (test: (key: string) => boolean) => {
		const index = readIndex();
		for (const [key, file] of Object.entries(index)) {
			if (!test(key)) continue;
			removeMediaFile(file.path);
			delete index[key];
		}
		for (const [key, path] of transient) {
			if (!test(key)) continue;
			removeMediaFile(path);
			transient.delete(key);
		}
		for (const key of pending.keys()) if (test(key)) pending.delete(key);
		if (Object.keys(index).length) saveIndex(index);
		else Taro.removeStorageSync(id);
	};
	return {
		remove,
		get(key: string, download: () => Promise<string>, extension?: string, persistent = true): Promise<string> {
			const inFlight = pending.get(key);
			if (inFlight) return inFlight;
			const cached = transient.get(key);
			if (cached) return Promise.resolve(cached);
			const files = persistent && !preview() ? Taro.getFileSystemManager() : undefined;
			if (files) {
				const index = readIndex();
				const existing = index[key];
				if (existing) {
					try {
						files.accessSync(existing.path);
						existing.used = Date.now();
						saveIndex(index);
						return Promise.resolve(existing.path);
					} catch {
						delete index[key];
						saveIndex(index);
					}
				}
			}
			const operation = Promise.resolve()
				.then(download)
				.then((path) => {
					if (pending.get(key) !== operation) {
						removeMediaFile(path);
						throw Object.assign(new Error("media scope changed"), { name: "AbortError" });
					}
					if (files) {
						try {
							const bytes = Number(files.statSync(path, false).size);
							const current = readIndex();
							if (Number.isSafeInteger(bytes) && bytes > 0 && bytes <= LIMIT) {
								const oldest = Object.entries(current).sort(([, a], [, b]) => a.used - b.used);
								let size = bytes + oldest.reduce((total, [, file]) => total + file.bytes, 0);
								for (const [oldKey, oldFile] of oldest) {
									if (size <= LIMIT && Object.keys(current).length < MAX_FILES) break;
									files.unlinkSync(oldFile.path);
									delete current[oldKey];
									size -= oldFile.bytes;
								}
								saveIndex(current);
								try {
									files.mkdirSync(root(), true);
								} catch {
									// Existing directory is reused.
								}
								const format =
									extension && /^[a-z0-9]{1,5}$/i.test(extension) ? extension : /\.([a-z0-9]{1,5})$/i.exec(path)?.[1];
								const suffix = format ? `.${format}` : "";
								const saved = files.saveFileSync(path, `${root()}/${digest(`${id}:${key}`)}${suffix}`);
								current[key] = { path: saved, bytes, used: Date.now() };
								return saveIndex(current) ? saved : keepTemporary(key, saved);
							}
						} catch {
							// The native temp file is usable when disk persistence is unavailable.
						}
					}
					// ponytail: H5 preview and a full disk reuse a bounded set of temporary files.
					return keepTemporary(key, path);
				})
				.finally(() => {
					if (pending.get(key) === operation) pending.delete(key);
				});
			pending.set(key, operation);
			return operation;
		},
	};
}
