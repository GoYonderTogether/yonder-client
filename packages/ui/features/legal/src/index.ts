import { enPrivacy } from "./privacy-en.ts";
import { zhPrivacy } from "./privacy-zh.ts";
import { enTerms } from "./terms-en.ts";
import { zhTerms } from "./terms-zh.ts";
import type { LegalDocument, LegalDocumentKind, LegalLocale } from "./types.ts";

export type { LegalDocument, LegalDocumentKind, LegalLocale, LegalSection } from "./types.ts";

const documents: Record<LegalLocale, Record<LegalDocumentKind, LegalDocument>> = {
	"zh-CN": { terms: zhTerms, privacy: zhPrivacy },
	en: { terms: enTerms, privacy: enPrivacy },
};

export function getLegalDocument(kind: LegalDocumentKind, locale: LegalLocale): LegalDocument {
	return documents[locale][kind];
}
