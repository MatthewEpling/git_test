import type { DiaryTier, HiscoresResult, QuestStatus, SkillName, WikiSyncData } from "./types";
import type { ManualState } from "./storage";
import { ALL_SKILLS, combatLevel } from "./skills";
import { QUESTS, canonQuest, parseDiaryKey } from "./gamedata";

/** Tri-state: known true, known false, or we simply don't have the data. */
export type Known = true | false | "unknown";

export type Account = {
  rsn: string;
  level: (s: SkillName) => number;
  /** false if the level came from an unranked hiscore entry with no sync data */
  levelKnown: (s: SkillName) => boolean;
  combat: number;
  total: number;
  quest: (name: string) => QuestStatus | "unknown";
  diary: (key: string) => Known;
  questPoints: number | null;
  hasQuestData: boolean;
  hasDiaryData: boolean;
  sync: WikiSyncData | null;
  hiscores: HiscoresResult | null;
  manual: ManualState;
};

export function buildAccount(
  rsn: string,
  hiscores: HiscoresResult | null,
  sync: WikiSyncData | null,
  manual: ManualState,
): Account {
  const level = (s: SkillName) => {
    const hs = hiscores?.skills[s];
    const fromSync = sync?.levels[s];
    const fromHs = hs?.ranked ? hs.level : undefined;
    return Math.max(fromHs ?? 0, fromSync ?? 0) || (s === "Hitpoints" ? 10 : 1);
  };
  const levelKnown = (s: SkillName) => Boolean(hiscores?.skills[s]?.ranked || sync?.levels[s] !== undefined);

  const quest = (nameRaw: string): QuestStatus | "unknown" => {
    const name = canonQuest(nameRaw);
    const m = manual.quests[name];
    if (sync) {
      const s = sync.quests[name];
      // Manual "done" overrides a stale sync; otherwise trust sync.
      if (m === "done") return "done";
      return s ?? "unknown";
    }
    return m ?? "unknown";
  };

  const diary = (key: string): Known => {
    const parsed = parseDiaryKey(key);
    if (!parsed) return "unknown";
    const [region, tier] = parsed as [string, DiaryTier];
    if (manual.diaries[`${region} ${tier}`]) return true;
    const d = sync?.diaries[region]?.[tier];
    if (d) return d.complete;
    if (sync && Object.keys(sync.diaries).length) return false;
    return manual.diaries[`${region} ${tier}`] === false ? false : "unknown";
  };

  let questPoints: number | null = sync?.questPoints ?? null;
  if (!sync) {
    const manualDone = Object.entries(manual.quests).filter(([, s]) => s === "done");
    questPoints = manualDone.length ? manualDone.reduce((a, [n]) => a + (QUESTS[n]?.qp ?? 0), 0) : null;
  }

  const total = ALL_SKILLS.reduce((a, s) => a + level(s), 0);
  return {
    rsn,
    level,
    levelKnown,
    combat: combatLevel(level),
    total: hiscores?.overall.level && hiscores.overall.level >= total ? hiscores.overall.level : total,
    quest,
    diary,
    questPoints,
    hasQuestData: Boolean(sync && Object.keys(sync.quests).length) || Object.keys(manual.quests).length > 0,
    hasDiaryData: Boolean(sync && Object.keys(sync.diaries).length) || Object.keys(manual.diaries).length > 0,
    sync,
    hiscores,
    manual,
  };
}
