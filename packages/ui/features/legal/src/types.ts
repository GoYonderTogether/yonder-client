export interface LegalSection {
	heading: string;
	paragraphs: string[];
}

export interface LegalDocument {
	title: string;
	version: string;
	effectiveDate: string;
	intro: string[];
	sections: LegalSection[];
}

export type LegalDocumentKind = "terms" | "privacy";
export type LegalLocale = "zh-CN" | "en";
