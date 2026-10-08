// Client-side parser for data the player copies from their own WikiSync page.
// We never call the WikiSync API from code — the player opens the page and pastes it.
import type { DiaryTier, QuestStatus, SkillName, WikiSyncData } from "./types";
import { ALL_SKILLS } from "./skills";
import { QUESTS, canonQuest, DIARY_REGIONS, norm } from "./gamedata";

export class WikiSyncParseError extends Error {}

const TIERS: DiaryTier[] = ["Easy", "Medium", "Hard", "Elite"];

function questStatus(v: unknown): QuestStatus | null {
  if (v === 2 || v === "2" || v === true) return "done";
  if (v === 1 || v === "1") return "in_progress";
  if (v === 0 || v === "0" || v === false) return "not_started";
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s.includes("finish") || s.includes("complete")) return "done";
    if (s.includes("progress") || s.includes("start")) return s.includes("not") ? "not_started" : "in_progress";
  }
  return null;
}

export function parseWikiSync(raw: string): WikiSyncData {
  const text = raw.trim();
  if (!text) throw new WikiSyncParseError("The box is empty — paste the whole WikiSync page.");
  // Browsers sometimes show "Raw Data"/"Pretty-print" labels above JSON; find the outermost object.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) {
    throw new WikiSyncParseError("That doesn't look like WikiSync data — make sure you copied the whole page (Ctrl+A, Ctrl+C).");
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text.slice(first, last + 1));
  } catch {
    throw new WikiSyncParseError("That doesn't look like WikiSync data — the text was cut off or isn't JSON. Copy the whole page again.");
  }

  const questsIn = json.quests as Record<string, unknown> | undefined;
  const diariesIn = json.achievement_diaries as Record<string, Record<string, { complete?: boolean; tasks?: boolean[] }>> | undefined;
  if (!questsIn && !diariesIn && !json.levels) {
    throw new WikiSyncParseError("That doesn't look like WikiSync data — no quests, diaries or levels were found. Make sure you copied the whole page.");
  }

  const quests: Record<string, QuestStatus> = {};
  for (const [name, v] of Object.entries(questsIn ?? {})) {
    const st = questStatus(v);
    if (st) quests[canonQuest(name)] = st;
  }

  const diaries: WikiSyncData["diaries"] = {};
  for (const [regionRaw, tiers] of Object.entries(diariesIn ?? {})) {
    const region = DIARY_REGIONS.find((r) => norm(r) === norm(regionRaw)) ?? regionRaw;
    diaries[region] = {};
    for (const tier of TIERS) {
      const t = tiers?.[tier] ?? tiers?.[tier.toLowerCase()];
      if (!t) continue;
      const tasks = Array.isArray(t.tasks) ? t.tasks : [];
      diaries[region][tier] = {
        complete: Boolean(t.complete),
        done: tasks.filter(Boolean).length,
        total: tasks.length,
      };
    }
  }

  const levels: WikiSyncData["levels"] = {};
  for (const [k, v] of Object.entries((json.levels as Record<string, number>) ?? {})) {
    const name = (k === "Runecrafting" ? "Runecraft" : k) as SkillName;
    if (ALL_SKILLS.includes(name) && typeof v === "number") levels[name] = v;
  }

  const ca = Array.isArray(json.combat_achievements) ? (json.combat_achievements as number[]) : [];
  const clog = Array.isArray(json.collection_log) ? (json.collection_log as number[]) : [];
  const clogCount = typeof json.collectionLogItemCount === "number" ? json.collectionLogItemCount : clog.length || null;

  // Quest points: sum of finished quests we know the value of. Only shown if every finished quest is known.
  let qp = 0;
  let unknown = 0;
  for (const [name, st] of Object.entries(quests)) {
    if (st !== "done") continue;
    const info = QUESTS[name];
    if (info) qp += info.qp;
    else unknown++;
  }

  return {
    username: String(json.username ?? ""),
    timestamp: typeof json.timestamp === "string" ? json.timestamp : undefined,
    quests,
    diaries,
    levels,
    combatAchievements: ca,
    collectionLog: clog,
    collectionLogCount: clogCount,
    questPoints: Object.keys(quests).length && unknown === 0 ? qp : null,
  };
}

export const wikiSyncUrl = (rsn: string) =>
  `https://sync.runescape.wiki/runelite/player/${encodeURIComponent(rsn)}/STANDARD`;
