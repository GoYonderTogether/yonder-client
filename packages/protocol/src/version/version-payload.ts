/**
 * The one shared type of the shell: what `GET /api/version` answers.
 *
 * The server builds it, the web page reads it, and the desktop shell shows it. Nothing else
 * belongs here — the protocol package depends on nothing.
 */
export type VersionPayload = {
	/** Release version of the build, in the `0.<minor>.<YYMMDDNN>` scheme. */
	version: string;
};
