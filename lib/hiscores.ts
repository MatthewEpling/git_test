// Server-only: fetches and normalises OSRS hiscores. Imported by app/api/hiscores/route.ts.
import type { AccountType, HiscoresResult, SkillName, ActivityEntry } from "./types";
import { ALL_SKILLS, emptySkills } from "./skills";

const UA =
  process.env.HISCORES_USER_AGENT ||
  "IronNavigator/0.1 (OSRS Ironman guide; contact: set HISCORES_USER_AGENT)";

const TABLES = {
  ironman: "hiscore_oldschool_ironman",
  hardcore: "hiscore_oldschool_hardcore_ironman",
  ultimate: "hiscore_oldschool_ultimate",
  main: "hiscore_oldschool",
} as const;
type Table = keyof typeof TABLES;

const TTL_MS = 7 * 60 * 1000; // 7 minutes
const cache = new Map<string, { at: number; data: HiscoresResult }>();

export class HiscoresError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type OfficialJson = {
  skills: { name: string; rank: number; level: number; xp: number }[];
  activities: { name: string; rank: number; score: number }[];
};

async function fetchOfficial(table: Table, rsn: string): Promise<OfficialJson | null> {
  const url = `https://secure.runescape.com/m=${TABLES[table]}/index_lite.json?player=${encodeURIComponent(rsn)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (res.status === 429) throw new HiscoresError(429, "The hiscores are rate-limiting us. Try again in a minute.");
  if (!res.ok) throw new HiscoresError(502, `Hiscores returned ${res.status}`);
  return (await res.json()) as OfficialJson;
}

function normaliseOfficial(
  json: OfficialJson,
  rsn: string,
  requestedType: AccountType,
  source: HiscoresResult["source"],
): HiscoresResult {
  const skills = emptySkills();
  let overall: HiscoresResult["overall"] = { level: null, xp: null, rank: null };
  for (const s of json.skills) {
    if (s.name === "Overall") {
      overall = s.rank === -1
        ? { level: null, xp: null, rank: null }
        : { level: s.level, xp: s.xp, rank: s.rank };
      continue;
    }
    const name = (s.name === "Runecrafting" ? "Runecraft" : s.name) as SkillName;
    if (!ALL_SKILLS.includes(name)) continue;
    if (s.rank === -1 || s.level === -1) {
      skills[name] = { level: name === "Hitpoints" ? 10 : 1, xp: null, rank: null, ranked: false };
    } else {
      skills[name] = { level: s.level, xp: s.xp, rank: s.rank, ranked: true };
    }
  }
  const activities: ActivityEntry[] = json.activities
    .filter((a) => a.score > 0)
    .map((a) => ({ name: a.name, score: a.score, rank: a.rank > 0 ? a.rank : null }));
  return { rsn, requestedType, source, skills, overall, activities, fetchedAt: new Date().toISOString() };
}

type WomJson = {
  displayName: string;
  type: string;
  latestSnapshot?: {
    data: {
      skills: Record<string, { experience: number; rank: number; level: number }>;
      bosses: Record<string, { kills: number; rank: number }>;
      activities: Record<string, { score: number; rank: number }>;
    };
  };
};

const pretty = (k: string) => k.split("_").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");

async function fetchWom(rsn: string, requestedType: AccountType): Promise<HiscoresResult | null> {
  const res = await fetch(`https://api.wiseoldman.net/v2/players/${encodeURIComponent(rsn)}`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new HiscoresError(502, `Wise Old Man returned ${res.status}`);
  const json = (await res.json()) as WomJson;
  const data = json.latestSnapshot?.data;
  if (!data) return null;
  const skills = emptySkills();
  for (const name of ALL_SKILLS) {
    const key = name === "Runecraft" ? "runecrafting" : name.toLowerCase();
    const s = data.skills[key];
    if (s && s.rank > 0 && s.level > 0) {
      skills[name] = { level: s.level, xp: s.experience, rank: s.rank, ranked: true };
    }
  }
  const ov = data.skills.overall;
  const activities: ActivityEntry[] = [
    ...Object.entries(data.bosses ?? {}).filter(([, b]) => b.kills > 0).map(([k, b]) => ({ name: pretty(k), score: b.kills, rank: b.rank > 0 ? b.rank : null })),
    ...Object.entries(data.activities ?? {}).filter(([, a]) => a.score > 0).map(([k, a]) => ({ name: pretty(k), score: a.score, rank: a.rank > 0 ? a.rank : null })),
  ];
  const typeNote =
    json.type && json.type !== "unknown" && !(json.type === requestedType || (requestedType === "group" && json.type === "regular"))
      ? `Wise Old Man lists this account as "${json.type}".`
      : undefined;
  return {
    rsn: json.displayName || rsn,
    requestedType,
    source: "wiseoldman",
    warning: ["Official hiscores were unavailable, so this data comes from Wise Old Man and may be slightly out of date.", typeNote].filter(Boolean).join(" "),
    skills,
    overall: ov && ov.rank > 0 ? { level: ov.level, xp: ov.experience, rank: ov.rank } : { level: null, xp: null, rank: null },
    activities,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getHiscores(rsnRaw: string, type: AccountType, force = false): Promise<HiscoresResult> {
  const rsn = rsnRaw.trim().replace(/[_-]/g, " ").replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9 ]{1,12}$/.test(rsn)) throw new HiscoresError(400, "That isn't a valid RuneScape name (1–12 letters, numbers or spaces).");

  const key = `${type}:${rsn.toLowerCase()}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data;

  // Group ironmen are ranked on the regular hiscores individually.
  const primary: Table = type === "group" ? "main" : type;

  let result: HiscoresResult | null = null;
  try {
    const json = await fetchOfficial(primary, rsn);
    if (json) {
      result = normaliseOfficial(json, rsn, type, primary);
    } else if (primary !== "main") {
      // Not on the iron table. Check where they are so we can explain why.
      if (type === "hardcore") {
        const iron = await fetchOfficial("ironman", rsn);
        if (iron) {
          result = normaliseOfficial(iron, rsn, type, "ironman");
          result.warning = "Not on the Hardcore hiscores but found on the Ironman hiscores — this Hardcore may have lost their status. Showing Ironman data.";
        }
      }
      if (!result) {
        const main = await fetchOfficial("main", rsn);
        if (main) {
          result = normaliseOfficial(main, rsn, type, "main");
          result.warning = `Not found on the ${type === "ultimate" ? "Ultimate" : type === "hardcore" ? "Hardcore" : "Ironman"} hiscores, but found on the main hiscores. The account may be de-ironed, or you picked the wrong account type.`;
        }
      }
    }
    if (!result) throw new HiscoresError(404, `No hiscore entry for "${rsn}". Check the spelling — accounts below the rank threshold in every skill may not appear.`);
  } catch (e) {
    if (e instanceof HiscoresError && (e.status === 404 || e.status === 400)) throw e;
    // Network failure / rate limit / outage → try Wise Old Man
    const wom = await fetchWom(rsn, type).catch(() => null);
    if (!wom) throw e instanceof HiscoresError ? e : new HiscoresError(502, "Couldn't reach the hiscores. Try again shortly.");
    result = wom;
  }

  cache.set(key, { at: Date.now(), data: result });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return result;
}
