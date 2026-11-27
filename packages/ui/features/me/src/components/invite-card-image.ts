export const INVITE_CARD_FILENAME = "yonder-invitation.png";

/** Download exactly the displayed poster. */
export async function saveInviteCard(poster: SVGSVGElement, filename = INVITE_CARD_FILENAME): Promise<void> {
	const blob = await renderInviteCard(poster);
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The displayed poster as a PNG, with inline SVG styles and no remote image requests. */
export async function renderInviteCard(poster: SVGSVGElement): Promise<Blob> {
	const copy = poster.cloneNode(true) as SVGSVGElement;
	copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	// The poster's own viewBox decides the size; jsdom and old engines without one fall back to 600 × 800.
	const width = poster.viewBox?.baseVal?.width || 600;
	const height = poster.viewBox?.baseVal?.height || 800;
	copy.setAttribute("width", String(width));
	copy.setAttribute("height", String(height));
	copy.style.width = `${width}px`;
	copy.style.height = `${height}px`;
	copy.style.maxHeight = "none";
	copy.style.fontFamily = getComputedStyle(poster).fontFamily;
	const originals = [poster, ...poster.querySelectorAll("*")];
	const copies = [copy, ...copy.querySelectorAll("*")];
	originals.forEach((element, index) => {
		const style = getComputedStyle(element);
		const target = copies[index] as SVGElement;
		target.style.fill = style.fill;
		target.style.stroke = style.stroke;
		target.style.color = style.color;
		target.style.display = style.display;
	});
	const source = URL.createObjectURL(
		new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }),
	);
	try {
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error("image unavailable"));
			image.src = source;
		});
		const canvas = document.createElement("canvas");
		canvas.width = width * 2;
		canvas.height = height * 2;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("canvas unavailable");
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
		if (!blob) throw new Error("image unavailable");
		return blob;
	} finally {
		URL.revokeObjectURL(source);
	}
}
