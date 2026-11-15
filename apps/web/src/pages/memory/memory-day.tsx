import { cn } from "@yonder/ui-components";
import { CalendarDays, Flag, Images, MapPin, Mic, Sunrise } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dateKey } from "./timeline-period.ts";

export interface MemoryMoment {
	id: string;
	kind: "recording" | "photos" | "place" | "schedule" | "keyMoment";
	title: string;
	startsAt: string;
	endsAt?: string;
	location?: string;
	photos?: string[];
	audioUrl?: string;
}
const KIND_ICONS = { recording: Mic, photos: Images, place: MapPin, schedule: CalendarDays, keyMoment: Flag };

export function MemoryDay({ selected, now, moments }: { selected: Date; now: Date; moments: MemoryMoment[] }) {
	const { t, i18n } = useTranslation();
	const isToday = dateKey(selected) === dateKey(now);
	const time = (date: Date) =>
		new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
	if (!moments.length)
		return (
			<div className="memory-day">
				{[0, 6, 12, 18, 24].map((hour) => (
					<div key={hour} className="memory-hour" style={{ top: `${(hour / 24) * 100}%` }}>
						<span>{`${String(hour).padStart(2, "0")}:00`}</span>
						<span className="memory-hour-rule" />
					</div>
				))}
				{isToday ? (
					<div className="memory-now" style={{ top: `${((now.getHours() * 60 + now.getMinutes()) / 1440) * 100}%` }}>
						<span>{t("memory.now", { time: time(now) })}</span>
					</div>
				) : null}
				<div className="memory-day-empty">
					<Sunrise size={24} strokeWidth={1.4} aria-hidden />
					<p>{t("memory.dayEmpty")}</p>
				</div>
			</div>
		);
	const nodes: { id: string; at: number; moment?: MemoryMoment; current?: boolean }[] = [
		...[0, 6, 12, 18, 24].map((hour) => ({
			id: `hour-${hour}`,
			at: new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), hour).getTime(),
		})),
		...moments.map((moment) => ({ id: moment.id, at: Date.parse(moment.startsAt), moment })),
		...(isToday ? [{ id: "now", at: now.getTime(), current: true }] : []),
	].sort((a, b) => a.at - b.at);
	return (
		<ol className="memory-flow">
			{nodes.map((node) => {
				const moment = node.moment;
				if (!moment)
					return (
						<li key={node.id} className={cn("memory-flow-tick", node.current && "memory-flow-current")}>
							<span>
								{node.current
									? t("memory.now", { time: time(now) })
									: node.id === "hour-24"
										? "24:00"
										: time(new Date(node.at))}
							</span>
							<span />
						</li>
					);
				const Icon = KIND_ICONS[moment.kind];
				return (
					<li key={node.id} className="memory-flow-event">
						<span className="memory-flow-icon">
							<Icon size={16} aria-hidden />
						</span>
						<article className={cn("memory-moment", node.at > now.getTime() && "memory-moment-upcoming")}>
							<p className="text-caption text-[var(--color-text-secondary)]">
								<time dateTime={moment.startsAt}>{time(new Date(moment.startsAt))}</time>
								{moment.endsAt ? ` — ${time(new Date(moment.endsAt))}` : null} · {t(`memory.${moment.kind}`)}
							</p>
							<h3 className="break-words text-body font-medium">{moment.title}</h3>
							{moment.location ? (
								<p className="text-caption text-[var(--color-text-secondary)]">{moment.location}</p>
							) : null}
							{moment.audioUrl ? (
								<audio controls preload="none" src={moment.audioUrl} className="mt-[var(--spacing-3)] w-full">
									<track kind="captions" />
								</audio>
							) : null}
							{moment.photos?.length ? (
								<div className="mt-[var(--spacing-3)] grid grid-cols-3 gap-[var(--spacing-2)]">
									{moment.photos.map((src) => (
										<a key={src} href={src} target="_blank" rel="noreferrer">
											<img
												src={src}
												alt={moment.title}
												loading="lazy"
												className="aspect-square w-full rounded-[var(--radius-control-sm)] object-cover"
											/>
										</a>
									))}
								</div>
							) : null}
						</article>
					</li>
				);
			})}
		</ol>
	);
}
