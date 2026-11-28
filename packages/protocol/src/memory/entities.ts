/**
 * The people, organisations, projects and places an owner keeps a page for (README 2026-11-28,
 * D1). A page is known by a stable `ent_…` id, not its file name, so a rename never breaks a link,
 * and one person can carry every name they are known by as an alias.
 *
 * These are the shapes a route or a client renders. Contact values appear only in `EntityContact`,
 * which only the owner's own read returns — a group, a visitor and an outward read never see them.
 */

import type { BrandId } from "../brands.ts";

export type EntityType = "person" | "org" | "project" | "place";

/** The six fixed relations a person can have to the owner; anything else is `其他`. */
export type EntityRelation = "家人" | "朋友" | "同事" | "投资人或客户" | "合作伙伴" | "其他";

export type EntityAliasKind = "name" | "nickname" | "handle" | "former";

export type EntityReferenceKind = "member" | "conversation" | "asset" | "event" | "card" | "file" | "entity";

export type EntityReferenceRole =
	| "sender"
	| "participant"
	| "mention"
	| "about"
	| "depicted"
	| "avatar"
	| "face_reference"
	| "member_of"
	| "founder"
	| "works_at"
	| "alumnus_of"
	| "attended"
	| "organized";

export type EntityReferenceState = "suggested" | "confirmed" | "rejected";

export type EntityContactKind = "phone" | "email" | "wechat" | "other";

/** One name the entity answers to. Two entities may share a name; the caller judges the ambiguity. */
export interface EntityAlias {
	alias: string;
	kind: EntityAliasKind;
}

/** One thing an entity is tied to: a member, a channel conversation, an asset, an event and so on. */
export interface EntityReference {
	kind: EntityReferenceKind;
	/** The referenced row's own stable id (a member id, a conversation id, an asset id, `ent_…`). */
	refId: string;
	role: EntityReferenceRole;
	/** Where a conversation ref came from, such as `wechat`, when there is a source. */
	connector: string | null;
	state: EntityReferenceState;
}

/** A phone, email or WeChat handle. Owner-only: never embedded, never returned by a group read. */
export interface EntityContact {
	kind: EntityContactKind;
	value: string;
	label: string | null;
}

/** An entity as a list or a result names it. No contacts. */
export interface EntitySummary {
	id: string;
	type: EntityType;
	name: string;
	tags: string[];
	relation: EntityRelation;
	roles: string[];
	/** The page file the entity mirrors, if it has one; `null` when only a record exists so far. */
	pageFileId: string | null;
	/** An id this entity was merged into, when it is an old id that still resolves to the survivor. */
	mergedInto: string | null;
}

/** One entity in full, as `GET /v1/entities/:id` and the owner's own `entity get` return it. */
export interface EntityDetail extends EntitySummary {
	aliases: EntityAlias[];
	/** The current path of the entity's page, for a client to open; `null` when it has no page. */
	path: string | null;
	references: EntityReference[];
	/**
	 * The owner's own contacts. Absent from any read that is not the owner's own: a group and an
	 * outward turn never receive them.
	 */
	contacts?: EntityContact[];
}

/**
 * Where an entity's picture comes from (02 链接), in the order the server tries them: the asset the
 * owner picked as its `avatar`, the avatar of a registered member it names, an organisation's brand
 * icon, and otherwise its name's first character. The server never goes looking for a photo.
 */
export type EntityAvatar =
	/**
	 * A picture the owner pointed at: an image attachment, read through the attachment cache the rest
	 * of the app uses, never a public URL.
	 */
	| { kind: "asset"; attachmentId: string; mimeType: string }
	/** A member's own picture, at the same address the app draws elsewhere. */
	| { kind: "member"; url: string }
	/** The brand whose app the organisation lives in (04 图标登记表). */
	| { kind: "brand"; brand: BrandId }
	/** No picture anywhere: the client draws the name's first character. */
	| { kind: "initial" };

/**
 * `GET /v1/entities/:id` — what a client needs to open a person or an organisation from an
 * `entity:<id>` link (02 链接): the name to show, the page to open and the picture to draw. An old id
 * of a merged entity answers with the survivor, so a link written before a merge still opens. Owner
 * read only; a group, a visitor and an outward read never reach this route.
 */
export interface EntityProfile {
	id: string;
	type: EntityType;
	name: string;
	/** The current page path (`/people/…`), or `null` when the entity has no page yet. */
	path: string | null;
	avatar: EntityAvatar;
}

/**
 * The YAML head a person or project page carries (02 页首元数据). `id` is the server's; `orgs`
 * are resolved to org entities when a page is saved. Only these keys are interpreted; any other
 * property the owner added in an editor is kept as written.
 */
export interface EntityFrontMatter {
	id: string;
	type: EntityType;
	aliases: string[];
	tags: string[];
	relation: EntityRelation;
	orgs: string[];
	roles: string[];
}
