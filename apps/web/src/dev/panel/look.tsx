import { useLocalePreference, useTheme } from "@yonder/ui-data";
import type { ThemeChoice } from "@yonder/ui-tokens";

type Width = "full" | "390" | "820";

export function Look({ width, setWidth }: { width: Width; setWidth: (width: Width) => void }) {
	const { choice, setChoice } = useTheme();
	const { locale, setLocale } = useLocalePreference();
	return (
		<details open>
			<summary>Look</summary>
			<div className="dev-panel-fields">
				<label>
					Theme
					<select value={choice} onChange={(event) => setChoice(event.target.value as ThemeChoice)}>
						<option value="system">System</option>
						<option value="light">Light</option>
						<option value="dark">Dark</option>
					</select>
				</label>
				<label>
					Locale
					<select value={locale} onChange={(event) => setLocale(event.target.value === "zh-CN" ? "zh-CN" : "en")}>
						<option value="zh-CN">中文</option>
						<option value="en">English</option>
					</select>
				</label>
				<label>
					App width
					<select value={width} onChange={(event) => setWidth(event.target.value as Width)}>
						<option value="full">Full</option>
						<option value="390">390 px</option>
						<option value="820">820 px</option>
					</select>
				</label>
			</div>
		</details>
	);
}
