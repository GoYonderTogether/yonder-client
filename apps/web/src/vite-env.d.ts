/// <reference types="vite/client" />

declare const __YONDER_VERSION__: string;

interface ImportMetaEnv {
	readonly VITE_API_BASE?: string;
	/** Public download links for the landing page; empty means "no public download". */
	readonly VITE_IOS_DOWNLOAD_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
