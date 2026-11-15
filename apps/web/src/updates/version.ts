/** Compare SemVer precedence, including numeric prerelease identifiers. */
export function compareVersions(left: string, right: string): number {
	const parse = (version: string) => {
		const match =
			/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
				version,
			);
		if (!match?.[1] || !match[2] || !match[3]) throw new Error("Invalid version");
		const prerelease = match[4]?.split(".");
		if (prerelease?.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) {
			throw new Error("Invalid version");
		}
		return { core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])] as const, prerelease };
	};
	const a = parse(left);
	const b = parse(right);
	for (const index of [0, 1, 2] as const) {
		if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
	}
	if (!a.prerelease || !b.prerelease) return a.prerelease ? -1 : b.prerelease ? 1 : 0;
	for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
		const x = a.prerelease[index];
		const y = b.prerelease[index];
		if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
		if (x === y) continue;
		const xNumeric = /^\d+$/.test(x);
		const yNumeric = /^\d+$/.test(y);
		if (xNumeric && yNumeric) return BigInt(x) > BigInt(y) ? 1 : -1;
		if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
		return x > y ? 1 : -1;
	}
	return 0;
}
