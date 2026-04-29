import { highlights } from "./highlights";
import { overview } from "./overview";
import { projects } from "./projects";
import { leadership } from "./leadership";
import { skills } from "./skills";
import { metrics } from "./metrics";
import { contact } from "./contact";
import { HIDDEN_SHEETS } from "./_data";
import type { SheetData } from "@/lib/excel/types";

/** Visible sheets - these show up in the tab strip. */
export const SHEETS: SheetData[] = [
  highlights,
  overview,
  projects,
  leadership,
  skills,
  metrics,
  contact,
];

/** Full lookup including hidden `_data` sheets (for formula resolution). */
export const SHEETS_BY_ID: Record<string, SheetData> = Object.fromEntries(
  [...SHEETS, ...HIDDEN_SHEETS].map((s) => [s.id, s])
);
