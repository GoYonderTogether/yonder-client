import type { TimelineDay } from "../pages/memory/timeline/timeline-types.ts";

/** The four days before that. Quiet and test days are left out: they are not worth reading back. */
export const daysB: TimelineDay[] = [
	{
		date: "2026-11-23",
		weekday: "周一",
		lead: "这天的主线是融资：你先按新节奏重估了时间表，见完刀哥，又决定先缓。",
		open: ["读录音的功能待开发，读完笔记才定融资计划。", "第一批用户什么时候找还在定。"],
		events: [
			{
				marker: "半夜",
				headline: "过了零点你还在算开发节奏，头已经疼得睡不着。",
				steps: [
					{
						at: "00:01",
						kind: "thought",
						text: "你算清了一件事：AI 系统的节奏不是写代码的节奏。",
						detail: "一轮任务四五小时，三两天做完一版，整体磨稳要两三周。你把融资时间表按这个重排。",
					},
					{
						at: "00:03",
						kind: "talk",
						text: "头痛压着你，吃了布洛芬也睡不着。",
						detail: "那晚的重点不是睡够，是别带着一个炸掉的头去见刀哥。",
					},
				],
			},
			{
				marker: "中午",
				headline: "见完刀哥，你把融资先搁下了。",
				steps: [
					{
						at: "11:58",
						kind: "decision",
						text: "先把读录音的功能做出来，让它读完那几十条笔记，再谈计划。",
					},
				],
			},
			{
				marker: "傍晚",
				headline: "傍晚一份投资招募计划到了，你抱着猫拍了一组。",
				steps: [
					{
						at: "17:18",
						kind: "message",
						from: { name: "张颖丽" },
						source: { brand: "wechat", label: "来自微信" },
						text: "连尚集团云汉投资的张颖丽发来 AI 创业者招募计划：50 万到 200 万，5% 到 10% 早期股权。",
						detail: "她问你有没有 demo 或 MVP。",
					},
					{
						at: "17:26",
						kind: "photo",
						text: "你抱着猫拍了一组",
						photos: [
							"149FF7B7-DAFC-4EBC-9C2C-D6066CF1AEDF",
							"282B8843-ECF3-4B11-A9E3-F7C446126F7E",
							"946AA4D1-B22B-4B71-9C9A-2AD53FAD9A1C",
							"DB55113B-4458-4295-B895-06653B22545D",
							"EE623CD0-6465-4D4F-89B3-8D298FC09662",
						],
						photoNote: "五张 · 家里",
					},
				],
			},
			{
				marker: "晚上",
				headline: "晚上你说头不疼了。",
				steps: [
					{
						at: "22:19",
						kind: "talk",
						text: "晚饭是猪脚饭四拼。",
						detail: "那种「总觉得缺点啥、又说不上想吃啥」，不是饿，也不是嘴馋。",
					},
					{
						at: "22:27",
						kind: "photo",
						text: "睡前又拍了猫",
						photos: [
							"8656CFC8-54E2-4C29-A818-59DA2E32D30D",
							"BFDAC22E-2593-49A6-972D-CA6F1A077914",
							"DECF1EA5-AFC0-449A-89F3-F2B3B39EDBAA",
						],
						photoNote: "三张 · 家里",
					},
				],
			},
		],
	},
	{
		date: "2026-11-22",
		weekday: "周日",
		lead: "白天 Mac 上的文件终于能被读到了；到了半夜，你和它聊了很久关于她的事。",
		open: ["微信归档的只读测试还等你拍板：三个选项，你还没选。"],
		events: [
			{
				marker: "傍晚",
				headline: "你的 MacBook Air 连上了，它第一次翻完了你的开发目录。",
				steps: [
					{
						at: "17:53",
						kind: "decision",
						text: "三个仓库的分工、目录结构、文档和进展，一次看清。",
					},
				],
			},
			{
				marker: "半夜",
				headline: "半夜你和它聊了很久关于她的事，最后是抱着她道歉收的尾。",
				steps: [
					{
						at: "22:54",
						kind: "talk",
						text: "你说，总觉得女朋友像小孩子一样。",
						detail: "你不是在嫌弃她爱好小，是心里一直有个声音：我在扛，你有没有看见我在扛。",
					},
					{
						at: "23:50",
						kind: "talk",
						text: "后来你头痛，问它怎么知道你最近几晚都是两三点才睡。",
						detail: "因为你发的每条消息都带着时间。",
					},
				],
			},
		],
	},
	{
		date: "2026-11-20",
		weekday: "周五",
		lead: "这天你给它立了第一个目标：把 macOS 上的微信聊天记录打通。",
		open: ["连接器授权搁置，等版本更新。"],
		events: [
			{
				marker: "中午",
				headline: "你交代了一件要它长期推进的事。",
				steps: [
					{
						at: "11:33",
						kind: "decision",
						text: "把 macOS 上的微信聊天记录打通，之后盯着你指定的群。",
					},
					{
						at: "17:51",
						kind: "talk",
						text: "下午你说连接器授权可能有问题，先别管，等版本更新。",
					},
				],
			},
		],
	},
	{
		date: "2026-11-19",
		weekday: "周四",
		lead: "第一天：你把它当一个人试了一遍。",
		events: [
			{
				marker: "下午",
				headline: "下午你第一次跟它说话，问它能做什么、怎么用。",
				steps: [
					{
						at: "14:01",
						kind: "talk",
						text: "你问它能做什么、这个软件怎么用。",
						detail: "它的回答是：把它当微信里加了个人那样用就行。",
					},
				],
			},
		],
	},
];
