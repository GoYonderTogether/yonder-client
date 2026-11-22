/** Share the import (including Vite's CSS readiness) between entry warmup and React.lazy. */
export function warmableImport<Module>(load: () => Promise<Module>) {
	let pending: Promise<Module> | undefined;
	return () =>
		(pending ??= load().catch((error: unknown) => {
			pending = undefined;
			throw error;
		}));
}
