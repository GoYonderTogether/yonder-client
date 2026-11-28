import type { EntityAvatar } from "@yonder/protocol";
import { Avatar, BrandIcon } from "@yonder/ui-components";
import { useEntityProfile } from "@yonder/ui-data";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useObjectUrl } from "../../lib/use-object-url.ts";
import { useAttachmentBlob } from "../../preview/use-attachment-blob.ts";
import { useOpenMemoryFile } from "./memory-file-detail.tsx";

/**
 * `entity:<id>` links (02 链接): the person or organisation a file or a timeline card names, opened
 * by its stable id. The server answers `GET /v1/entities/:id` with the current page path and where the
 * picture comes from — the asset the owner picked, a member's own avatar, an organisation's brand
 * icon, or the name's first character. It never goes looking for a photo.
 */

/** The protocol entity id in an `entity:` link, or `null` when the target is not one. */
export function entityIdOf(target: string): string | null {
	const match = /^entity:(ent_[0-9A-HJKMNP-TV-Z]{26})$/u.exec(target.trim());
	return match?.[1] ?? null;
}

/**
 * What to draw for an entity, in the server's order: a member's picture or the asset the owner chose
 * (read through the same attachment cache as the rest of the app), the brand icon of an
 * organisation, otherwise the name's first character.
 */
export function EntityAvatarMark({
	avatar,
	name,
	size = 24,
}: {
	avatar: EntityAvatar | undefined;
	name: string;
	size?: 16 | 24 | 28 | 32 | 40;
}) {
	if (avatar?.kind === "member") return <Avatar name={name} src={avatar.url} size={size} />;
	if (avatar?.kind === "asset") return <AssetAvatar attachment={avatar} name={name} size={size} />;
	if (avatar?.kind === "brand") return <BrandIcon name={avatar.brand} size={size} />;
	return <Avatar name={name} size={size} />;
}

function AssetAvatar({
	attachment,
	name,
	size,
}: {
	attachment: Extract<EntityAvatar, { kind: "asset" }>;
	name: string;
	size: 16 | 24 | 28 | 32 | 40;
}) {
	const { blob, load } = useAttachmentBlob(
		{ id: attachment.attachmentId, kind: "image", name, mimeType: attachment.mimeType, size: 0 },
		"thumb",
	);
	const url = useObjectUrl(blob);
	useEffect(() => {
		void load();
	}, [load]);
	return <Avatar name={name} src={url} size={size} />;
}

/**
 * One `entity:<id>` link drawn as the timeline draws a message: the person's picture, a brand icon or
 * the initial, then their name. It opens the entity's page in the existing file pane — a person page
 * is a memory file — so a link needs no page of its own. Without a profile yet, the link's own words
 * stay as plain text.
 */
export function EntityLink({ id, text }: { id: string; text: string }) {
	const { t } = useTranslation();
	const profile = useEntityProfile(id).data;
	const openFile = useOpenMemoryFile();
	const name = profile?.name || text.trim();
	if (!profile?.path) return <span>{name}</span>;
	const path = profile.path;
	return (
		<button
			type="button"
			className="memory-entity-link"
			aria-label={t("memory.openEntity", { name })}
			onClick={() => openFile(path, name)}
		>
			<EntityAvatarMark avatar={profile.avatar} name={name} size={16} />
			{name}
		</button>
	);
}

/** The entity tokens in a line of plain text: `entity:<id>`, and the Markdown form `[名字](entity:<id>)`. */
const ENTITY_TOKEN =
	/(?:\[([^\]\n]+)\]\(\s*entity:(ent_[0-9A-HJKMNP-TV-Z]{26})\s*\)|entity:(ent_[0-9A-HJKMNP-TV-Z]{26}))/gu;

/**
 * A line of timeline text with its `entity:<id>` tokens drawn as links (02 链接 链接): `[刀哥](entity:ent_…)`
 * shows 刀哥, a bare `entity:ent_…` shows the entity's own name once its profile answers. Text outside
 * the tokens is rendered as it was written.
 */
export function EntityText({ text }: { text: string }) {
	const parts: React.ReactNode[] = [];
	let last = 0;
	for (const match of text.matchAll(ENTITY_TOKEN)) {
		const [whole, label, labelledId, bareId] = match;
		const id = labelledId ?? bareId;
		if (!id || match.index === undefined) continue;
		if (match.index > last) parts.push(text.slice(last, match.index));
		parts.push(<EntityLink key={`${id}:${match.index}`} id={id} text={label ?? ""} />);
		last = match.index + whole.length;
	}
	if (last === 0) return <>{text}</>;
	if (last < text.length) parts.push(text.slice(last));
	return <>{parts}</>;
}
