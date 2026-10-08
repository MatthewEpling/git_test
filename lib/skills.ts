import type { SkillName, SkillEntry } from "./types";

/** In-game skill tab order, 3 columns × 8 rows (Sailing sits after Hunter). */
export const SKILL_GRID: SkillName[] = [
  "Attack", "Hitpoints", "Mining",
  "Strength", "Agility", "Smithing",
  "Defence", "Herblore", "Fishing",
  "Ranged", "Thieving", "Cooking",
  "Prayer", "Crafting", "Firemaking",
  "Magic", "Fletching", "Woodcutting",
  "Runecraft", "Slayer", "Farming",
  "Construction", "Hunter", "Sailing",
];

export const ALL_SKILLS = [...SKILL_GRID];

export const skillIcon = (s: string) =>
  `https://oldschool.runescape.wiki/images/${encodeURIComponent(s)}_icon.png`;

export const wikiUrl = (page: string) =>
  `https://oldschool.runescape.wiki/w/${encodeURIComponent(page.replace(/ /g, "_"))}`;

export function combatLevel(get: (s: SkillName) => number): number {
  const base = 0.25 * (get("Defence") + get("Hitpoints") + Math.floor(get("Prayer") / 2));
  const melee = 0.325 * (get("Attack") + get("Strength"));
  const range = 0.325 * Math.floor((3 * get("Ranged")) / 2);
  const mage = 0.325 * Math.floor((3 * get("Magic")) / 2);
  return Math.floor(base + Math.max(melee, range, mage));
}

export function emptySkills(): Record<SkillName, SkillEntry> {
  const out = {} as Record<SkillName, SkillEntry>;
  for (const s of ALL_SKILLS) {
    out[s] = { level: s === "Hitpoints" ? 10 : 1, xp: null, rank: null, ranked: false };
  }
  return out;
}

export type Stage = "Early" | "Early-Mid" | "Mid" | "Late" | "Endgame";

/** Stage from total level, nudged by quest points when we know them. */
export function stageFor(total: number, qp: number | null): Stage {
  let score = total;
  if (qp !== null) score += Math.max(-150, Math.min(150, (qp - total / 7.5) * 2));
  if (score < 750) return "Early";
  if (score < 1250) return "Early-Mid";
  if (score < 1750) return "Mid";
  if (score < 2100) return "Late";
  return "Endgame";
}
