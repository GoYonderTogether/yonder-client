/** Save exactly the displayed poster, with inline SVG styles and no remote image requests. */
export async function saveInviteCard(poster: SVGSVGElement): Promise<void> {
	const copy = poster.cloneNode(true) as SVGSVGElement;
	copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	copy.setAttribute("width", "600");
	copy.setAttribute("height", "800");
	copy.style.width = "600px";
	copy.style.height = "800px";
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
		canvas.width = 1200;
		canvas.height = 1600;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("canvas unavailable");
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
		if (!blob) throw new Error("image unavailable");
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "yonder-invitation.png";
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	} finally {
		URL.revokeObjectURL(source);
	}
}
