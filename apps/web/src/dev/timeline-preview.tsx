import { ArrowUp, Camera, ChevronRight, MoonStar, Sun, X } from "lucide-react";
import { createContext, Fragment, useContext, useState } from "react";
import { Band, isoWeek } from "../pages/memory/timeline/timeline-bands.tsx";
import { ChatDrawer, type DrawerLine } from "../pages/memory/timeline/timeline-drawer.tsx";
import { KindIcon } from "../pages/memory/timeline/timeline-kinds.tsx";
import { type Sky, SkyIcon, SkyMark } from "../pages/memory/timeline/timeline-sky.tsx";
import type { TimelineDay, TimelineEvent, TimelineStep } from "../pages/memory/timeline/timeline-types.ts";
import wechatIcon from "./icons/wechat.png";
import { previewDays } from "./timeline-preview-days.ts";
import "../pages/memory/timeline/timeline-cards.css";
import "../pages/memory/timeline/timeline-cards-parts.css";
import "../pages/memory/timeline/timeline-cards-drawer.css";

/** Photos next to this file, hashed by Vite; the route is dev-only, so none of them ship. */
const photos = import.meta.glob("./photos/*.jpg", { eager: true, query: "?url", import: "default" }) as Record<
	string,
	string
>;
const photoUrl = (name: string) => photos[`./photos/${name}.jpg`] ?? "";

/** Which sky a part of the day sits under, from the clock alone. A span such as 从上午到下午 takes the sky it starts in. */
const skyOf = (marker = ""): Sky => {
	const first = marker.replace(/^从/u, "").split("到")[0] ?? marker;
	if (/清晨|早上/u.test(first)) return "dawn";
	if (/傍晚/u.test(first)) return "dusk";
	if (/上午|中午|下午/u.test(first)) return "day";
	return "night";
};

/** What a reference can open. The drawer's surrounding lines are sample context for this preview only: the real ones come from the chat archive, found by message id. */
type Open = { drawer: { title: string; anchor: string; lines: DrawerLine[] } } | { photo: string; from: string };
const OpenContext = createContext<(target: Open) => void>(() => {});

const sampleLines = (step: TimelineStep): DrawerLine[] => {
	const who = step.from?.name ?? "";
	return [
		{ id: "before", at: step.at, who: "你", text: "（前一句，示意）" },
		{ id: "anchor", at: step.at, who, text: step.text },
		{ id: "after", at: step.at, who: "你", text: "（后一句，示意）" },
	];
};

/** What mattered gets a card of its own; a single quiet line of talk does not. */
const isMajor = (event: TimelineEvent) =>
	event.steps.length > 1 ||
	event.steps.some((step) => step.photos?.length || step.from || step.kind === "decision" || step.kind === "recording");

type Block = { card: TimelineEvent } | { quiet: TimelineEvent[] };

/** Time order is kept: neighbouring small things share one quiet list, big things break it. */
const blocksOf = (events: TimelineEvent[]): Block[] => {
	const out: Block[] = [];
	for (const event of events) {
		if (isMajor(event)) {
			out.push({ card: event });
			continue;
		}
		const last = out.at(-1);
		if (last && "quiet" in last) last.quiet.push(event);
		else out.push({ quiet: [event] });
	}
	return out;
};

export default function TimelinePreviewPage() {
	const [theme, setTheme] = useState<"light" | "dark">("light");
	const [open, setOpen] = useState<Open | null>(null);
	// One direction, like the Photos app: oldest at the top, newest at the bottom.
	const days = [...previewDays].reverse();
	return (
		<OpenContext.Provider value={setOpen}>
			<main data-theme={theme} className="tl">
				<header className="tl-top">
					<h1>你的时间线</h1>
					<fieldset className="tl-seg">
						<legend className="sr-only">明暗</legend>
						<button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
							<Sun size={14} aria-hidden />
							浅色
						</button>
						<button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
							<MoonStar size={14} aria-hidden />
							深色
						</button>
					</fieldset>
				</header>
				<div className="tl-stage">
					{days.map((day, index) => (
						<Fragment key={day.date}>
							<Band date={day.date} prev={days[index - 1]?.date} />
							<Day day={day} />
						</Fragment>
					))}
					<p className="tl-now">此刻</p>
				</div>
				<NowPanel items={previewDays[0]?.open ?? []} />
				{open && "drawer" in open ? (
					<ChatDrawer
						title={open.drawer.title}
						anchor={open.drawer.anchor}
						lines={open.drawer.lines}
						onClose={() => setOpen(null)}
					/>
				) : null}
				{open && "photo" in open ? (
					<div className="tl-lightbox" role="dialog" aria-label="图片预览">
						<img src={photoUrl(open.photo)} alt="" />
						<div className="tl-lightbox-bar">
							<span>来自 {open.from}</span>
							<button type="button" onClick={() => setOpen(null)}>
								<X size={14} aria-hidden />
								关闭
							</button>
						</div>
					</div>
				) : null}
			</main>
		</OpenContext.Provider>
	);
}

function Day({ day }: { day: TimelineDay }) {
	return (
		<section className="tl-day" aria-label={day.date}>
			<header className="tl-day-head">
				<strong>{Number(day.date.slice(8))}</strong>
				<span>
					{Number(day.date.slice(5, 7))} 月 · 第 {isoWeek(day.date).week} 周 · {day.weekday}
				</span>
			</header>
			<p className="tl-narration">{day.lead}</p>
			<ol className="tl-blocks">
				{blocksOf(day.events).map((block) =>
					"card" in block ? (
						<Card key={block.card.marker + block.card.headline} event={block.card} />
					) : (
						<Quiet key={block.quiet.map((event) => event.headline).join()} events={block.quiet} />
					),
				)}
			</ol>
		</section>
	);
}

/** The present, pinned to the bottom and kept out of the history above: one line to talk to the main Bot, the tasks running now, and what is waiting on you (three cards at most). A task is a status, not a button; a waiting item is a button that prefills the draft, and nothing is sent. */
function NowPanel({ items, running = [] }: { items: string[]; running?: string[] }) {
	const [draft, setDraft] = useState("");
	const shownRunning = running.slice(0, 3);
	const shownItems = items.slice(0, Math.max(0, 3 - shownRunning.length));
	return (
		<section className="tl-nowbar" aria-label="此刻">
			{shownRunning.length + shownItems.length ? (
				<ul className="tl-nowcards">
					{shownRunning.map((task) => (
						<li key={task} className="tl-nowtask">
							<span className="tl-pulse" aria-hidden />
							<span>{task}</span>
						</li>
					))}
					{shownItems.map((item) => (
						<li key={item}>
							<button type="button" className="tl-nowcard" onClick={() => setDraft(`关于「${item}」：`)}>
								<span>{item}</span>
								<ChevronRight className="tl-nowcard-go" size={14} aria-hidden />
							</button>
						</li>
					))}
				</ul>
			) : null}
			<div className="tl-nowinput">
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="对它说点什么"
					aria-label="对主 Bot 说"
				/>
				<button type="button" aria-label="发送" disabled={!draft.trim()}>
					<ArrowUp size={16} aria-hidden />
				</button>
			</div>
		</section>
	);
}

/** A thing that mattered: a card with its part of the day, one headline, then what happened in it. */
function Card({ event }: { event: TimelineEvent }) {
	const sky = skyOf(event.marker);
	return (
		<li className="tl-card" data-sky={sky}>
			<SkyMark sky={sky} />
			<span className="tl-chip">
				<SkyIcon sky={sky} size={16} />
				{event.marker}
			</span>
			<h3 className="tl-card-title">{event.headline}</h3>
			<ol className="tl-steps">
				{event.steps.map((step) => (
					<Step key={step.at + step.text} step={step} />
				))}
			</ol>
		</li>
	);
}

/** Small things: one grey line each, no card, so they read as small. */
function Quiet({ events }: { events: TimelineEvent[] }) {
	return (
		<li className="tl-quiet">
			<ul>
				{events.map((event) => (
					<li key={event.marker + event.headline}>
						<time>{event.steps[0]?.at}</time>
						<span>{event.headline}</span>
					</li>
				))}
			</ul>
		</li>
	);
}

function Step({ step }: { step: TimelineStep }) {
	const openTarget = useContext(OpenContext);
	const count = step.photos?.length ?? 0;
	if (count) {
		return (
			<li className="tl-step tl-step-photo">
				<div className={`tl-strip tl-strip-${Math.min(count, 4)}`}>
					{step.photos?.slice(0, 4).map((photo) => (
						<button
							key={photo}
							type="button"
							className="tl-photo"
							aria-label="查看大图"
							onClick={() => openTarget({ photo, from: `相册 · ${step.at}` })}
						>
							<img src={photoUrl(photo)} alt="" loading="lazy" />
						</button>
					))}
					{count > 4 ? <span className="tl-strip-more">+{count - 4}</span> : null}
				</div>
				<p className="tl-photo-note">
					<Camera size={12} aria-hidden />
					{step.at} · {step.text}
					{step.photoNote ? ` · ${step.photoNote}` : ""}
				</p>
			</li>
		);
	}
	if (step.from) {
		return (
			<li className="tl-step tl-step-message">
				<time className="tl-time">{step.at}</time>
				<button
					type="button"
					className="tl-msg"
					onClick={() =>
						openTarget({
							drawer: { title: `${step.from?.name ?? ""} · 微信`, anchor: "anchor", lines: sampleLines(step) },
						})
					}
				>
					<img className="tl-msg-icon" src={wechatIcon} alt="微信" width={28} height={28} />
					<div>
						<p className="tl-msg-from">{step.from.name}</p>
						<p className="tl-msg-text">{step.text}</p>
						{step.detail ? <p className="tl-msg-detail">{step.detail}</p> : null}
					</div>
				</button>
			</li>
		);
	}
	const kind = step.kind === "recording" || step.kind === "decision" || step.kind === "thought" ? step.kind : null;
	return (
		<li className={`tl-step tl-step-${step.kind}`}>
			<time className="tl-time">{step.at}</time>
			<div className="tl-step-body">
				<p className="tl-step-text">
					{kind ? <KindIcon kind={kind} size={14} /> : null}
					{step.text}
				</p>
				{step.detail ? <p className="tl-step-detail">{step.detail}</p> : null}
			</div>
		</li>
	);
}
