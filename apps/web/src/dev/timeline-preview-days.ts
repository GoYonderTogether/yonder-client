import type { TimelineDay } from "../pages/memory/timeline/timeline-types.ts";
import { daysA } from "./timeline-days-a.ts";
import { daysB } from "./timeline-days-b.ts";

/** Newest first; the page reverses it so the oldest day is at the top. */
export const previewDays: TimelineDay[] = [...daysA, ...daysB];
