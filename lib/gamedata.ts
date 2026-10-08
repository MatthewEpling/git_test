import questsJson from "@/data/quests.json";
import diariesJson from "@/data/diaries.json";
import type { DiaryTier, SkillName } from "./types";

export type QuestInfo = {
  qp: number;
  members: boolean;
  difficulty: string;
  length: string;
  quests: string[];
  skills: Partial<Record<SkillName | "Combat", number>>;
  qpReq: number | null;
};

export type DiaryReq = {
  skills: Partial<Record<SkillName | "Combat", number>>;
  quests: string[];
  qpReq: number | null;
};

export const QUESTS = questsJson.quests as unknown as Record<string, QuestInfo>;
export const DIARIES = diariesJson.diaries as unknown as Record<string, Record<DiaryTier, DiaryReq>>;
export const DIARY_REGIONS = Object.keys(DIARIES);
export const DIARY_TIERS: DiaryTier[] = ["Easy", "Medium", "Hard", "Elite"];
export const WIKI_DATA_DATE = questsJson._generated;

export const TOTAL_QP = Object.values(QUESTS).reduce((a, q) => a + q.qp, 0);

/** Loose key so "Desert Treasure II - The Fallen Empire" == "desert treasure ii – the fallen empire" */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/[–—-]/g, "-").replace(/[^a-z0-9'!-]+/g, " ").trim();

const byNorm = new Map(Object.keys(QUESTS).map((k) => [norm(k), k]));
/** Canonical quest name, or the input if we don't know it. */
export const canonQuest = (name: string) => byNorm.get(norm(name)) ?? name;

/** "Ardougne Easy" → ["Ardougne","Easy"] ; tolerant of "Kourend Medium" etc. */
export function parseDiaryKey(key: string): [string, DiaryTier] | null {
  const m = key.match(/^(.*)\s+(Easy|Medium|Hard|Elite)$/i);
  if (!m) return null;
  const tier = (m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) as DiaryTier;
  const r = norm(m[1]);
  const region = DIARY_REGIONS.find((x) => norm(x) === r || norm(x).startsWith(r));
  return region ? [region, tier] : null;
}
