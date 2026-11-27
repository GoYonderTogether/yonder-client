declare module "node-forge/lib/sha256.js" {
	const sha256: {
		create(): { update(input: string): void; digest(): { toHex(): string } };
	};
	export default sha256;
}
