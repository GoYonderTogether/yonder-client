import { daysA } from "./timeline-days-a.ts";
import { daysB } from "./timeline-days-b.ts";
import type { PreviewDay } from "./timeline-preview-types.ts";

/** Newest first; the page reverses it so the oldest day is at the top. */
export const previewDays: PreviewDay[] = [...daysA, ...daysB];
