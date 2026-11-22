/// <reference types="vite/client" />

declare const __YONDER_VERSION__: string;
declare const __YONDER_PILOT_API_LOCAL__: boolean;

interface ImportMetaEnv {
	readonly VITE_API_BASE?: string;
	readonly VITE_INTERNAL_ERROR_BUILD?: string;
	readonly VITE_INTERNAL_ERROR_ORIGIN?: string;
	/** Public download links for the landing page; empty means "no public download". */
	readonly VITE_IOS_DOWNLOAD_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
