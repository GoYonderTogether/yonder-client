import type { LegalDocument } from "./types.ts";

export const enPrivacy: LegalDocument = {
	title: "Privacy Policy",
	version: "1.0",
	effectiveDate: "2026-11-15",
	intro: [
		"The Chinese version of this document is authoritative.",
		"未至之境（武汉）科技有限公司 (Weizhizhijing (Wuhan) Technology Co., Ltd., “we” or “us”) operates Yonder at https://yonder.zethai.cn. This policy explains how we process your personal information and how you can exercise your rights.",
	],
	sections: [
		{
			heading: "Information we process",
			paragraphs: [
				"Sign-in and profile: We use your mobile number and SMS code for registration, sign-in or password reset. Tencent Cloud SMS processes the information needed to send the code. You can also set a password, display name and avatar.",
				"Devices and sessions: We record device type, device name and sign-in time to manage sessions. When handling SMS code and password sign-in requests, we use your IP address and store its hash to protect accounts and the service.",
				"Conversations and models: We process your messages with your Bot to display conversations and generate replies. To generate replies, we send necessary conversation content to the service for the selected model. You may configure your own provider and key; the key is stored encrypted and used only for calls you initiate.",
				"Quota and invitations: We record quota grants, invite rewards and consumption to calculate your quota. Anyone opening your invite link can see your display name and avatar.",
			],
		},
		{
			heading: "Cookies and local storage",
			paragraphs: [
				"The website uses cookies to store session credentials and local storage to save theme, language and invite code. The app may also use secure device storage for session credentials. Clearing cookies or local data may require you to sign in or set your preferences again.",
			],
		},
		{
			heading: "Storage and transfers abroad",
			paragraphs: [
				"Our servers are hosted by Alibaba Cloud in Hangzhou, mainland China. We retain personal information for as long as needed to provide the service, unless the law requires otherwise.",
				"We do not independently select overseas providers to transfer your conversation content. If you configure and select an overseas provider, we send the content to that provider at your choice, and it may therefore reach a place outside mainland China. Where personal information is transferred abroad, we will act in accordance with applicable law. Please review the provider’s processing rules before choosing it.",
			],
		},
		{
			heading: "Your rights",
			paragraphs: [
				"You may exercise your legal rights to access, copy, correct or delete personal information, withdraw consent, or request account closure. You can edit your profile and sign out devices in the app. You can also make these requests by contacting Wu Bingqi at 186 8073 6501. We will reply within 15 working days.",
				"**Withdrawing consent may affect use of the related feature, but does not affect processing based on consent before withdrawal.**",
				"You can request account closure in Me › Account and security. A 30-day cooling-off period follows, and signing in again during it cancels the request. After it ends, we delete or anonymise your personal information within 15 working days, **except where laws or administrative regulations require us to keep it**, for example network logs kept for at least 6 months. Information kept by law is not processed beyond storage and necessary security protection.",
			],
		},
		{
			heading: "Minors",
			paragraphs: [
				"**Yonder is not intended for children under 14. Users aged 14 or older but under 18 must obtain a guardian’s consent before use.**",
			],
		},
		{
			heading: "Policy changes",
			paragraphs: [
				"We will notify you in the product when this policy changes. Where the law requires consent, we will seek it as required.",
			],
		},
		{
			heading: "Contact us",
			paragraphs: [
				"For complaints or requests about personal information, contact Wu Bingqi at 186 8073 6501. We will reply within 15 working days.",
			],
		},
	],
};
