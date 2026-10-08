#!/usr/bin/env node
// Regenerates data/quests.json from the OSRS Wiki (CC BY-NC-SA 3.0).
// Run with: npm run wiki:sync   (do this when a new quest comes out; never at request time)
//
// Sources:
//   - Quests/Free-to-play and Quests/Members tables → quest points, members flag, difficulty, length
//   - Bucket:Quest → requirement wikitext → direct quest prerequisites, skill levels, QP requirement
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://oldschool.runescape.wiki/api.php";
const UA = "IronNavigator/0.1 build script (set your contact in scripts/fetch-wiki.mjs)";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

const decode = (s) =>
  s.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function questTable(page, members) {
  const j = await api({ action: "parse", page, prop: "text" });
  const html = j.parse.text["*"];
  const out = {};
  const rowRe = /<tr data-rowid="([^"]+)">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const name = decode(m[1]);
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, "").trim());
    // [#, name, difficulty, length, qp, series, release]
    const qp = parseInt(cells[4], 10);
    if (Number.isNaN(qp)) continue; // skips miniquest tables etc.
    out[name] = { qp, members, difficulty: decode(cells[2] || ""), length: decode(cells[3] || "") };
  }
  return out;
}

function parseRequirements(wikitext) {
  const quests = [];
  const skills = {};
  let qpReq = null;
  for (const line of wikitext.split("\n")) {
    // Direct prerequisites are exactly two asterisks deep under "Completion of the following quests"
    const q = line.match(/^\*\*\s*(?:'''|''|Started:?\s*)?\[\[([^\]|#]+)/);
    if (q && !line.startsWith("***")) quests.push(q[1].trim());
  }
  for (const m of wikitext.matchAll(/data-skill="([^"]+)" data-level="(\d+)"/g)) {
    const [, skill, lvl] = m;
    const n = parseInt(lvl, 10);
    if (skill === "Quest points") qpReq = Math.max(qpReq ?? 0, n);
    else if (skill === "Combat level" || skill === "Combat") skills.Combat = Math.max(skills.Combat ?? 0, n);
    else skills[skill === "Runecrafting" ? "Runecraft" : skill] = Math.max(skills[skill] ?? 0, n);
  }
  return { quests: [...new Set(quests)], skills, qpReq };
}

const DIARY_REGIONS = [
  "Ardougne", "Desert", "Falador", "Fremennik", "Kandarin", "Karamja", "Kourend & Kebos",
  "Lumbridge & Draynor", "Morytania", "Varrock", "Western Provinces", "Wilderness",
];
const SKIP_KEYS = new Set(["maxrefs", "boostable", "selectable", "Total"]);

async function diaries() {
  const out = {};
  for (const region of DIARY_REGIONS) {
    const j = await api({ action: "parse", page: `${region} Diary`, prop: "wikitext" });
    const text = j.parse.wikitext["*"];
    out[region] = {};
    for (const tier of ["Easy", "Medium", "Hard", "Elite"]) {
      const start = text.indexOf(`\n${tier}=`);
      if (start === -1) continue;
      const nextTab = text.indexOf("\n|-|", start + 1);
      const block = text.slice(start, nextTab === -1 ? text.indexOf("</tabber>", start) : nextTab);
      const statsMatch = block.match(/\{\{DiarySkillStats([\s\S]*?)\n\}\}/);
      const skills = {};
      let qpReq = null;
      if (statsMatch) {
        for (const m of statsMatch[1].matchAll(/^\|([A-Za-z ]+?)\s*=\s*(\d+)\s*$/gm)) {
          const [, key, val] = m;
          if (SKIP_KEYS.has(key) || key.endsWith("Notes")) continue;
          if (key === "Quest") qpReq = parseInt(val, 10);
          else skills[key === "Runecrafting" ? "Runecraft" : key] = parseInt(val, 10);
        }
      }
      const quests = [...block.matchAll(/data-rowid="([^"]+)"/g)].map((m) => decode(m[1]));
      out[region][tier] = { skills, quests: [...new Set(quests)], qpReq };
    }
  }
  return out;
}

// Early-game collection log items worth flagging when missing. Names are resolved to item IDs from the wiki.
const NOTABLE_CLOG = [
  "Fire cape", "Fighter torso", "Dragon defender", "Abyssal whip", "Black mask",
  "Graceful hood", "Dragon pickaxe", "Herb sack", "Seed box", "Ranger boots",
];

async function notableClog() {
  const out = [];
  for (const name of NOTABLE_CLOG) {
    const q = `bucket('infobox_item').select('item_name','item_id','image').where('item_name','${name.replace(/'/g, "\\'")}').run()`;
    const j = await api({ action: "bucket", query: q });
    const ids = [...new Set((j.bucket ?? []).flatMap((r) => r.item_id ?? []).map((x) => parseInt(x, 10)).filter(Boolean))];
    if (ids.length) out.push({ name, ids, wiki: `https://oldschool.runescape.wiki/w/${encodeURIComponent(name.replace(/ /g, "_"))}` });
  }
  return out;
}

async function main() {
  console.log("Resolving notable collection log items…");
  const notable = await notableClog();
  writeFileSync(join(root, "data", "clog-notable.json"), JSON.stringify({ _source: "OSRS Wiki item IDs", items: notable }, null, 1));
  console.log(`Wrote ${notable.length} notable clog items.`);

  console.log("Fetching achievement diaries…");
  const diaryData = await diaries();
  writeFileSync(
    join(root, "data", "diaries.json"),
    JSON.stringify({ _source: "Generated from the Old School RuneScape Wiki (CC BY-NC-SA 3.0)", _generated: new Date().toISOString().slice(0, 10), diaries: diaryData }, null, 1),
  );
  console.log(`Wrote ${Object.keys(diaryData).length} diary regions.`);

  console.log("Fetching quest tables…");
  const f2p = await questTable("Quests/Free-to-play", false);
  const p2p = await questTable("Quests/Members", true);
  const table = { ...f2p, ...p2p };

  console.log("Fetching quest requirements from Bucket:Quest…");
  const reqs = {};
  let offset = 0;
  for (;;) {
    const q = `bucket('quest').select('page_name','requirements').limit(500).offset(${offset}).run()`;
    const j = await api({ action: "bucket", query: q });
    const rows = j.bucket ?? [];
    for (const r of rows) {
      if (r.page_name.includes("/")) continue; // subquest pages / guides
      reqs[r.page_name] = parseRequirements(r.requirements ?? "");
    }
    if (rows.length < 500) break;
    offset += 500;
  }

  const quests = {};
  for (const [name, info] of Object.entries(table)) {
    const r = reqs[name] ?? { quests: [], skills: {}, qpReq: null };
    quests[name] = { ...info, ...r, quests: r.quests.filter((x) => x !== name) };
  }

  const out = {
    _source: "Generated from the Old School RuneScape Wiki (CC BY-NC-SA 3.0) by scripts/fetch-wiki.mjs",
    _generated: new Date().toISOString().slice(0, 10),
    quests,
  };
  writeFileSync(join(root, "data", "quests.json"), JSON.stringify(out, null, 1));
  console.log(`Wrote ${Object.keys(quests).length} quests (${Object.values(quests).reduce((a, q) => a + q.qp, 0)} QP total).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
