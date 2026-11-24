import Taro from "@tarojs/taro";
import type { ChosenImage } from "../../lib/local-image";

/** The picker, capped to one image; a cancelled picker resolves `undefined`. */
export async function chooseAvatar(): Promise<ChosenImage | undefined> {
	const result = await Taro.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"] });
	const file = result.tempFiles?.[0] ?? (result.tempFilePaths?.[0] ? { path: result.tempFilePaths[0] } : undefined);
	if (!file) return undefined;
	const chosen = file as { path: string; size?: number; type?: string };
	return {
		path: chosen.path,
		...(chosen.size === undefined ? {} : { size: chosen.size }),
		...(chosen.type ? { type: chosen.type } : {}),
	};
}
