import type { LegalDocument } from "./types.ts";

export const enPrivacy: LegalDocument = {
	title: "Privacy Policy",
	version: "1.1",
	effectiveDate: "2026-11-21",
	intro: [
		"The Chinese version of this document is authoritative.",
		"未至之境（武汉）科技有限公司 (Weizhizhijing (Wuhan) Technology Co., Ltd., “we” or “us”) operates Yonder at https://yonder.zethai.cn. Yonder lets you chat with your own AI assistant (Bot), which handles tasks for you. This policy applies to Yonder as we provide it in mainland China. It explains how we process your personal information and how you can exercise your rights.",
		"Where a feature involves system permissions, sensitive personal information, providing personal information to another processor, or sending it outside mainland China, we will tell you separately in that feature and obtain your consent or separate consent as the law requires.",
	],
	sections: [
		{
			heading: "Information we process",
			paragraphs: [
				"**Sign-in and profile**: We use your mobile number and SMS code for registration, sign-in or password reset. If you sign in through the WeChat mini program, we store your mini program identity to recognize your account. You can also set a password, display name, avatar, public number and bio.",
				"**Devices and sessions**: We record device type, device name and sign-in time to manage sessions. If you turn on notifications, we store the device’s push identifier to send notifications to it. When handling SMS code and password sign-in requests, we use your IP address and store its hash to protect accounts and the service.",
				"**Conversations and content**: We process your messages with your Bot and the images, files and voice you send, to display conversations and generate replies. Your Bot turns lasting parts of conversations into memory (impression, recent and timeline cards). You can view, edit, make public or delete this memory at any time.",
				"**Meeting recordings**: When you use meeting recording, we process the recording, its transcript and the meeting summary, and keep them in your account until you delete them or close your account.",
				"**Devices and files**: After you authorize a device, your Bot can read, organize or modify files on that device within the authorized scope. File content your Bot reads may be used as context and handled as described in “AI and model providers” below.",
				"**Channel messages**: After you connect your Bot to channels such as Feishu or WeChat, we receive and process messages that you and others send to your Bot there, and send your Bot’s replies back. Those messages are also subject to the channel platform’s own rules.",
				"**Quota, invitations and friends**: We record quota grants, invite rewards and consumption, plus friend requests and visit records, to calculate your quota and provide social features. Anyone opening your invite link can see your display name and avatar.",
			],
		},
		{
			heading: "System permissions",
			paragraphs: [
				"We request permissions only when you use the related feature, for example: microphone (voice input and meeting recording), camera (scanning codes), notifications (new-message alerts) and device files (your Bot accessing files you authorize). You can withdraw a permission in system settings at any time. Withdrawing it may make the related feature unavailable but does not affect other features. Granting a system permission is not consent to any other use.",
			],
		},
		{
			heading: "AI and model providers",
			paragraphs: [
				"**Which features use models**: Bot replies, task handling, memory organization, meeting transcription and summaries, voice input and web search all need model providers. These features must send the relevant content to a model provider to work. If you do not agree, please do not use the related feature.",
				"**What we send**: Only what is needed for your request, including your messages and attachments, necessary conversation context, relevant Bot memory, file content you authorized your Bot to read, and audio for voice input and meeting recordings. This content may contain personal information about you or others.",
				"**Platform model providers**: Bot replies, tasks, memory organization and web search are handled by model and tool services from DeepSeek, which also handles voice input. Meeting transcription and speaker separation are handled by speech recognition from SiliconFlow. Real-time voice is handled by speech recognition from Alibaba Cloud Model Studio (DashScope). We choose among them according to the feature and availability, and do not go beyond this scope.",
				"**How we bind them**: Model providers act as processors on our behalf. We require them to process information only to provide the service, not to use it beyond the agreed purpose, to protect it with security measures, and to delete or return it as agreed when the engagement ends.",
				"**No training**: **We will not use your identifiable conversations, memory, attachments, recordings or file content to train foundation models offered to the public.** Data that has been anonymized so that it is no longer personal information may be used lawfully for security, reliability and service-quality analysis.",
				"**Providers you configure**: You may configure your own model provider and key. You choose that provider, and content is sent to it on your instruction, only for conversations you start and never for other people’s visits to your Bot. You are responsible for understanding that provider’s terms, charges and data-handling rules. The key is stored encrypted.",
				"**Where processing happens**: The platform model providers’ services are located in mainland China. We do not independently choose overseas providers to process your content. If you choose an overseas provider yourself, your content is sent abroad as a result. If we later use an overseas node, we will tell you beforehand and obtain your separate consent as the law requires.",
				"**Changes of provider**: Before we add a model provider, or materially change what we send, why, or where it is processed, we will tell you and, where needed, obtain your consent again.",
			],
		},
		{
			heading: "Who can see your content",
			paragraphs: [
				"**Your Bot**: Your Bot can read your conversations and memory to reply to you. Memory has three levels: private, public and confidential. Only you can see confidential content, on the page; your Bot cannot read it.",
				"**Visits through your card**: When your card and outside reception are on, others can chat with your Bot through your card. They see your Bot’s replies; **you can see those conversations**; and when your Bot replies to a visitor, it uses only content you marked public, not private content.",
				"**Your card**: What others see on your card depends on three privacy switches (whether you can be searched, whether the card is shown to users, and whether a public link is open). The card shows your display name, avatar, public number and bio.",
				"**When you visit someone else’s Bot**: The messages you send to that Bot can be seen by its owner.",
				"**Groups and channels**: Messages you post in a group can be seen by group members and Bots in the group. Messages in channels are also processed by that channel’s platform.",
			],
		},
		{
			heading: "Other service providers",
			paragraphs: [
				"**Cloud and storage**: Our servers and file storage are provided by Alibaba Cloud and located in Hangzhou, mainland China.",
				"**SMS**: Tencent Cloud SMS processes the information needed to send verification codes.",
				"**Push**: If you turn on notifications, we send alerts to your device through Apple’s and Google’s push services. A push contains only a generic notice such as “You have a new message” and conversation and message identifiers, not the message text. The push services therefore process your device’s push identifier.",
				"**Channel platforms**: After you connect channels such as Feishu or WeChat, messages pass through those platforms. They process what they receive independently under their own rules.",
				"Apart from the above and legal requirements, we do not sell your personal information or provide it to advertising networks.",
			],
		},
		{
			heading: "Cookies and local storage",
			paragraphs: [
				"The website uses cookies to store session credentials and local storage to save theme, language and invite code. The app may also use secure device storage for session credentials. Clearing cookies or local data may require you to sign in or set your preferences again.",
			],
		},
		{
			heading: "Storage, retention and transfers abroad",
			paragraphs: [
				"We process personal information collected and generated in mainland China under Chinese law, and store it on Alibaba Cloud servers in Hangzhou, mainland China.",
				"We keep personal information only as long as needed to achieve the purpose of processing. Conversations, memory and recordings are kept until you delete them, or handled as described below after account closure. Network logs are kept for at least 6 months as the law requires.",
				"Before providing personal information abroad, we will tell you the recipient, the purpose and how to exercise your rights, obtain your separate consent, and complete any required assessment or filing. If you turn on notifications, your device’s push identifier and a generic notice pass through Apple’s or Google’s push service; if you do not, this does not happen.",
			],
		},
		{
			heading: "Security",
			paragraphs: [
				"We encrypt data in transit, store the keys you configure encrypted, and limit internal access to what is needed. No internet service can guarantee absolute security, so please keep your codes and password safe.",
				"If personal information is, or may have been, leaked, altered or lost, we will take remedial steps immediately, report to the competent authority as the law requires, and notify affected users.",
			],
		},
		{
			heading: "Your rights",
			paragraphs: [
				"You may access, copy, correct, supplement or delete personal information, ask us to explain our processing rules, withdraw consent, restrict or refuse specific processing, or request account closure. You can edit your profile, manage memory and sign out devices in the app. You can also make these requests by contacting Wu Bingqi at 186 8073 6501. We will reply within 15 working days.",
				"**Withdrawing consent may affect use of the related feature, but does not affect processing based on consent before withdrawal.**",
				"You can request account closure in Me › Account and security. A 7-day cooling-off period follows, and signing in again during it cancels the request. When it ends, the account can no longer sign in and nobody can find you. We then delete or anonymize your personal information within 15 working days, **except where laws or administrative regulations require us to keep it**, for example network logs kept for at least 6 months. Information kept by law is not processed beyond storage and necessary security protection.",
				"If you believe our processing infringes your rights, you can complain to us or to the competent authority.",
			],
		},
		{
			heading: "Minors",
			paragraphs: [
				"**Yonder is available only to users aged 18 or older and is not intended for minors.** We do not knowingly collect minors’ personal information. If we find we have collected it by mistake, we will stop the related service and delete or anonymize it as the law requires. If a guardian believes we have processed personal information of a minor in their care, they can contact us and we will handle it as the law requires.",
			],
		},
		{
			heading: "Policy changes",
			paragraphs: [
				"We will notify you in the product when this policy changes, stating the version and effective date. If the purpose, method, type of information, recipients or your rights change materially, we will notify you in advance and, where the law requires, obtain your consent again.",
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
