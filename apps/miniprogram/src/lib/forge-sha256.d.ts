declare module "node-forge/lib/sha256.js" {
	const sha256: {
		create(): { update(input: string, encoding?: "utf8"): void; digest(): { toHex(): string } };
	};
	export default sha256;
}
