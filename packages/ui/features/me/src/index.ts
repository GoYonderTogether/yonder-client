/**
 * `@yonder/feature-me` — the 「我」 list of who you are and your settings, and each
 * section as a page. Sections whose features come later show honest empty states.
 */

export { AboutSection } from "./components/about-section.tsx";
export { AccountSection } from "./components/account-section.tsx";
export { DevicesSection, GeneralSection } from "./components/empty-sections.tsx";
export { InviteSection } from "./components/invite-section.tsx";
export { ProfileEditor } from "./components/profile-editor.tsx";
export { QuotaSection } from "./components/quota-section.tsx";
export type { MeListProps } from "./views/me-list.tsx";
export { MeList } from "./views/me-list.tsx";
export type { MeSectionPageProps } from "./views/me-section-page.tsx";
export { MeSectionPage } from "./views/me-section-page.tsx";
export type { MeSectionId } from "./views/sections.tsx";
export { isMeSection, ME_GROUPS, ME_SECTION_IDS } from "./views/sections.tsx";
