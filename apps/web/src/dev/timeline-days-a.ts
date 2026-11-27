import type { TimelineDay } from "../pages/memory/timeline/timeline-types.ts";

/** The three newest days, from prod and the owner's own Photos library. Nothing the Bot did for itself. */
export const daysA: TimelineDay[] = [
	{
		date: "2026-11-26",
		weekday: "周四",
		lead: "今天还没过完。早上有两个人在等你回话，下午你把两件想不明白的事拎出来想了一遍。",
		open: ["万圣尧的沙龙邀请和张颖丽的 demo 询问，还没回。"],
		events: [
			{
				marker: "上午",
				headline: "两个投资方面的人还等你的回话。",
				steps: [
					{
						at: "09:04",
						kind: "message",
						from: { name: "万圣尧、张颖丽" },
						text: "万圣尧问 12 月初那场和江城基金合办的投资沙龙你报不报。",
						detail: "张颖丽直接问有没有 demo 或 MVP，你当时只回了寒暄。",
					},
				],
			},
			{
				marker: "下午",
				headline: "下午你连着想了两件关于长期的事：一件是别人的长期主义，一件是你自己的长期积累。",
				steps: [
					{
						at: "16:52",
						kind: "thought",
						text: "你先问：AI 都这么发达了，读书还有没有意义。",
						detail: "问的不是读书，是投进去的那几个小时还值不值——你在意的是慢慢积累出来的那一层。",
					},
					{
						at: "16:56",
						kind: "talk",
						text: "接着你谈到为什么认同「孙学」里的长期主义。",
						detail: "那场对谈是邵艾伦 × 孙宇晨，四小时二十二分。结论是对方的，你认同的是其中一层。",
					},
				],
			},
		],
	},
	{
		date: "2026-11-25",
		weekday: "周三",
		lead: "这一天几乎全长在谈话上：凌晨定名字，白天理需求，晚上把一小时的录音熬成纪要。",
		open: ["五条需求里有三件等你拍板。"],
		events: [
			{
				marker: "凌晨",
				headline: "凌晨两点，你把后台任务怎么做、合伙人怎么称呼一次定下来。",
				steps: [
					{
						at: "02:08",
						kind: "thought",
						text: "你在给后台任务写提示词的结构。",
						detail: "先写可能的分类和处理方法，再写每一类的做法和验收。",
					},
					{
						at: "02:10",
						kind: "decision",
						text: "你把合伙人和产品线的名字一次订正清楚。",
						detail: "刀哥、吴冰琪是合伙人；today ai 是产品，manus 是肖弘的。",
					},
				],
			},
			{
				marker: "上午",
				headline: "你三点多才停，九点又坐回电脑前。",
				steps: [
					{
						at: "09:03",
						kind: "talk",
						text: "中间不到六个小时。",
						detail: "坐下第一件事，是问那几十条一两小时的录音为什么只读得出开头两分钟。",
					},
				],
			},
			{
				marker: "下午",
				headline: "午后你在家拍了猫。",
				steps: [
					{
						at: "13:20",
						kind: "photo",
						text: "猫趴在自动喂食器旁边",
						photos: ["03A5A246-04EE-43BE-B8AA-A86B86253521", "723AFDF3-95BF-4EE4-ACAD-8637D0A46D79"],
						photoNote: "两张 · 家里",
					},
				],
			},
			{
				marker: "晚上",
				headline: "晚上你把这一轮开发收了个尾：纪要出来，需求进群。",
				steps: [
					{
						at: "18:18",
						kind: "recording",
						text: "昨晚那一小时的长谈，纪要出来了。",
						detail: "最有用的部分是边用边测出来的那十来条待改点。",
					},
					{
						at: "18:31",
						kind: "talk",
						text: "你让它到「想法与方法论」群里同步开发信息。",
						detail: "从此这个群是你和它协作的地方。",
					},
				],
			},
		],
	},
	{
		date: "2026-11-24",
		weekday: "周二",
		lead: "你把录音助理从「记下来」推向「替我做事」，也把自己的群改了名。",
		open: ["路演要控制，可能先不找投资人。", "去华科、武大找人还停在计划上。"],
		events: [
			{
				marker: "中午",
				headline: "中午收到一个投资沙龙的邀约。",
				steps: [
					{
						at: "12:46",
						kind: "message",
						from: { name: "万圣尧" },
						text: "武汉农商行的万圣尧邀你 12 月初参加他和江城基金合办的天使轮投资沙龙。",
					},
				],
			},
			{
				marker: "下午",
				headline: "下午你在家拍了一组猫，也把自己的群改成了「想法与方法论」。",
				steps: [
					{
						at: "15:10",
						kind: "photo",
						text: "猫在阳光里",
						photos: [
							"A64E35EF-19B7-4BDD-A4A8-285B2ACA7972",
							"415A308C-B94E-4B09-A7CD-5A871E92256B",
							"210B71B5-EC0D-4A2D-8C79-D8573EDC1023",
							"5BBD1DFE-1D4B-40E4-AE98-26CF3298637F",
							"7875134B-83D4-4476-8E93-B08064778947",
						],
						photoNote: "五张连拍 · 家里",
					},
					{
						at: "15:16",
						kind: "talk",
						text: "改名时你当场纠正了它把「七分钟前」说成昨天。",
						detail: "你说的那句是：上下文里又缺了时间这个东西。",
					},
				],
			},
			{
				marker: "半夜",
				headline: "深夜你停下来想了一件事：这个方向其实非常危险。",
				steps: [
					{
						at: "23:29",
						kind: "recording",
						text: "那段三十一分钟的录音里，核心一句是：不做上限，做下限。",
					},
				],
			},
		],
	},
];
