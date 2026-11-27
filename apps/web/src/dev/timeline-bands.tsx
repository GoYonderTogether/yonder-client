/** Preview only: the week and month markers between days, computed from the dates alone. A week summary or a month's narration needs real data, so none is drawn here. */

const utc = (date: string) => {
	const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d));
};
const short = (t: Date) => `${t.getUTCMonth() + 1}.${t.getUTCDate()}`;

/** ISO week: it starts on Monday, and belongs to the year that holds its Thursday. */
export const isoWeek = (date: string) => {
	const t = utc(date);
	const monday = new Date(t);
	monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
	const thursday = new Date(monday);
	thursday.setUTCDate(monday.getUTCDate() + 3);
	const sunday = new Date(monday);
	sunday.setUTCDate(monday.getUTCDate() + 6);
	const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
	const week = Math.floor((thursday.getTime() - jan1) / (7 * 86_400_000)) + 1;
	return { key: `${thursday.getUTCFullYear()}-${week}`, week, range: `${short(monday)}–${short(sunday)}` };
};

/** Drawn before a day: a month title when the month turns, a week band when the week turns. */
export function Band({ date, prev }: { date: string; prev?: string | undefined }) {
	const newMonth = !prev || prev.slice(0, 7) !== date.slice(0, 7);
	const now = isoWeek(date);
	const newWeek = !prev || isoWeek(prev).key !== now.key;
	return (
		<>
			{newMonth ? (
				<h2 className="tl-month">
					{Number(date.slice(5, 7))} 月<span>{date.slice(0, 4)}</span>
				</h2>
			) : null}
			{newWeek ? (
				<p className="tl-week">
					第 {now.week} 周 · {now.range}
				</p>
			) : null}
		</>
	);
}
