export const macPermissionsEn = {
	manage: "Manage permissions",
	openSettings: "Open System Settings",
	failed: "Could not open this permission. Try again.",
	status: {
		granted: "System permission enabled",
		default: "Not requested",
		denied: "Not allowed",
		unknown: "Status unavailable",
	},
	microphone: { description: "Allow microphone access for voice input and recording.", authorize: "Allow microphone" },
	notifications: { description: "Allow system notifications for new messages.", authorize: "Allow notifications" },
	startup: {
		title: "Startup and background",
		login: "Open at login",
		approve: "Approve in System Settings",
		unavailable: "Login item status unavailable",
		background: "Allow background running",
		backgroundHint: "Yonder stays in the menu bar when you close its window. Quit Yonder to stop it.",
	},
};

export const macPermissionsZhCN: typeof macPermissionsEn = {
	manage: "管理权限",
	openSettings: "打开系统设置",
	failed: "无法打开此权限，请重试。",
	status: {
		granted: "系统权限已开启",
		default: "尚未请求",
		denied: "未允许",
		unknown: "无法读取状态",
	},
	microphone: { description: "允许使用麦克风进行语音输入和录音", authorize: "允许麦克风" },
	notifications: { description: "允许通过系统通知接收新消息提醒", authorize: "允许通知" },
	startup: {
		title: "启动与后台运行",
		login: "登录时启动",
		approve: "在系统设置中开启",
		unavailable: "无法读取登录项状态",
		background: "允许后台运行",
		backgroundHint: "关闭窗口后，Yonder 仍在菜单栏运行。退出 Yonder 即停止运行。",
	},
};
