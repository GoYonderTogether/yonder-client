import { Image, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { downloadAvatarImage, useSession } from "../lib/runtime";
import { useVisibleImage } from "./visible-image";

export function useAvatarPath(src?: string | null, visible = true) {
	const { memberId } = useSession();
	const [loaded, setLoaded] = useState<{ src: string; owner: string; path: string }>();
	useEffect(() => {
		if (!src || !memberId || !visible) return;
		let active = true;
		void downloadAvatarImage(src).then(
			(path) => {
				if (active) setLoaded({ src, owner: memberId, path });
			},
			() => {},
		);
		return () => {
			active = false;
		};
	}, [src, memberId, visible]);
	return loaded && loaded.src === src && loaded.owner === memberId ? loaded.path : undefined;
}

export function RemoteAvatar({ src }: { src?: string | null }) {
	const { id, visible } = useVisibleImage(Boolean(src));
	const path = useAvatarPath(src, visible);
	return (
		<View id={id} className="mini-avatar">
			{path ? <Image src={path} className="mini-avatar" mode="aspectFill" /> : null}
		</View>
	);
}
