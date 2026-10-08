// Layer 1 — the rules engine. Pure functions, no AI. Works for every player.
import guideJson from "@/data/guide.json";
import trainingJson from "@/data/training.json";
import type { EvaluatedStep, Settings, SkillName, Step } from "./types";
import type { Account } from "./account";
import { QUESTS, DIARIES, canonQuest, parseDiaryKey } from "./gamedata";

export const CHAPTERS = guideJson.chapters as { id: 1 | 2 | 3 | 4; title: string; blurb: string }[];
export const STEPS = guideJson.steps as unknown as Step[];
const TRAINING = trainingJson.methods as unknown as Record<string, [number, string][]>;

type SkillOrCombat = SkillName | "Combat";

export type Evaluated = EvaluatedStep & {
  missingSkills: { skill: SkillOrCombat; need: number; have: number }[];
  chosenBranch?: number;
};

export type GuideResult = {
  steps: Evaluated[]; // ordered, branch-resolved, with training steps inserted
  byChapter: Record<number, Evaluated[]>;
  next: Evaluated[];
  bottlenecks: { skill: SkillOrCombat; count: number; need: number; have: number }[];
  progress: { done: number; total: number };
};

function mergedRequirements(step: Step) {
  const skills: Partial<Record<SkillOrCombat, number>> = { ...(step.requirements.skills ?? {}) };
  const quests = new Set((step.requirements.quests ?? []).map(canonQuest));
  const diaries = new Set(step.requirements.diaries ?? []);
  let qpReq: number | null = null;
  const own = new Set((step.completesWhen?.quests ?? []).map(canonQuest));

  const bump = (s: string, n: number) => {
    const k = s as SkillOrCombat;
    skills[k] = Math.max(skills[k] ?? 0, n);
  };

  for (const q of step.completesWhen?.quests ?? []) {
    const info = QUESTS[canonQuest(q)];
    if (!info) continue;
    for (const [s, n] of Object.entries(info.skills)) if (n) bump(s, n);
    for (const pre of info.quests) if (!own.has(canonQuest(pre))) quests.add(canonQuest(pre));
    if (info.qpReq) qpReq = Math.max(qpReq ?? 0, info.qpReq);
  }
  // Starting a quest only needs its prerequisite quests, not the skill levels.
  for (const q of step.completesWhen?.questsStarted ?? []) {
    const info = QUESTS[canonQuest(q)];
    if (info) for (const pre of info.quests) quests.add(canonQuest(pre));
  }
  for (const key of step.completesWhen?.diaries ?? []) {
    const parsed = parseDiaryKey(key);
    if (!parsed) continue;
    const req = DIARIES[parsed[0]]?.[parsed[1]];
    if (!req) continue;
    for (const [s, n] of Object.entries(req.skills)) if (n && n > 1) bump(s, n);
    for (const q of req.quests) quests.add(canonQuest(q));
    if (req.qpReq) qpReq = Math.max(qpReq ?? 0, req.qpReq);
  }
  return { skills, quests: [...quests], diaries: [...diaries], qpReq, items: step.requirements.items ?? [] };
}

function autoComplete(step: Step, acc: Account): boolean {
  const cw = step.completesWhen;
  if (!cw) return false;
  const checks: boolean[] = [];
  for (const q of cw.quests ?? []) checks.push(acc.quest(q) === "done");
  for (const q of cw.questsStarted ?? []) {
    const s = acc.quest(q);
    checks.push(s === "done" || s === "in_progress");
  }
  for (const d of cw.diaries ?? []) checks.push(acc.diary(d) === true);
  for (const [s, n] of Object.entries(cw.skills ?? {})) checks.push(acc.level(s as SkillName) >= (n ?? 0));
  return checks.length > 0 && checks.every(Boolean);
}

export function trainingMethod(skill: string, from: number): string {
  const list = TRAINING[skill];
  if (!list) return "See the wiki training guide.";
  let pick = list[0][1];
  for (const [lvl, m] of list) if (from >= lvl) pick = m;
  return pick;
}

export function defaultBranch(step: Step, settings: Settings | null): number {
  const opts = step.branch?.options ?? [];
  const want = settings?.playstyle === "efficient" ? "efficient" : settings?.playstyle === "chill" ? "chill" : null;
  const i = want ? opts.findIndex((o) => o.style === want) : -1;
  return i >= 0 ? i : 0;
}

export function evaluateGuide(
  acc: Account,
  settings: Settings | null,
  checked: Record<string, boolean>,
  branches: Record<string, number>,
): GuideResult {
  // 1. Resolve branches
  const chosen = new Set<string>();
  const branchChoice: Record<string, number> = {};
  for (const s of STEPS) {
    if (!s.branch) continue;
    const idx = branches[s.id] ?? defaultBranch(s, settings);
    branchChoice[s.id] = idx;
    for (const id of s.branch.options[idx]?.stepIds ?? []) chosen.add(id);
  }

  const f2p = settings?.membership === "f2p";
  const base = STEPS.filter((s) => (!s.branchOnly || chosen.has(s.id)) && (!f2p || s.f2p));

  // 2. Evaluate each step
  const evaluated: Evaluated[] = base.map((step) => {
    const req = mergedRequirements(step);
    const missing: string[] = [];
    const missingSkills: Evaluated["missingSkills"] = [];
    for (const [s, need] of Object.entries(req.skills)) {
      if (!need) continue;
      const have = s === "Combat" ? acc.combat : acc.level(s as SkillName);
      if (have < need) {
        missingSkills.push({ skill: s as SkillOrCombat, need, have });
        const unknownTag = s !== "Combat" && !acc.levelKnown(s as SkillName) ? " (unranked — level unknown)" : "";
        missing.push(`${s} ${need} (you have ${have})${unknownTag}`);
      }
    }
    for (const q of req.quests) {
      const st = acc.quest(q);
      if (st !== "done") missing.push(st === "unknown" ? `${q} (not synced)` : q);
    }
    for (const d of req.diaries) {
      const st = acc.diary(d);
      if (st !== true) missing.push(st === "unknown" ? `${d} diary (not synced)` : `${d} diary`);
    }
    if (req.qpReq) {
      if (acc.questPoints === null) missing.push(`${req.qpReq} quest points (not synced)`);
      else if (acc.questPoints < req.qpReq) missing.push(`${req.qpReq} quest points (you have ${acc.questPoints})`);
    }

    const autoDone = autoComplete(step, acc);
    const done = checked[step.id] ?? autoDone;
    return {
      ...step,
      requirements: { ...step.requirements, skills: req.skills as Step["requirements"]["skills"], quests: req.quests },
      status: done ? "done" : missing.length ? "blocked" : "ready",
      missing,
      missingSkills,
      autoDone,
      chosenBranch: step.branch ? branchChoice[step.id] : undefined,
    };
  });

  // 3. Insert training steps in front of skill-blocked steps
  const trained: Record<string, number> = {};
  const out: Evaluated[] = [];
  for (const step of evaluated) {
    if (step.status === "blocked" && step.missingSkills.length && step.missingSkills.length <= 4 && !step.skipNote?.startsWith("Only if")) {
      for (const ms of step.missingSkills) {
        if (ms.skill === "Combat") continue;
        if ((trained[ms.skill] ?? 0) >= ms.need) continue;
        trained[ms.skill] = ms.need;
        const id = `train-${ms.skill.toLowerCase()}-${ms.need}`;
        const done = checked[id] ?? false;
        out.push({
          id,
          chapter: step.chapter,
          title: `Train ${ms.skill} to ${ms.need}`,
          category: ms.skill === "Sailing" ? "sailing" : "skill",
          requirements: {},
          instructions: trainingMethod(ms.skill, ms.have),
          whyNow: `Needed for: ${step.title}`,
          wikiUrl: `https://oldschool.runescape.wiki/w/Ironman_Guide/${ms.skill === "Attack" || ms.skill === "Strength" ? "Melee" : ms.skill}`,
          status: done ? "done" : "ready",
          missing: [],
          missingSkills: [],
          autoDone: false,
          synthetic: true,
        });
      }
    }
    out.push(step);
  }

  // 4. Group, next, bottlenecks, progress
  const byChapter: Record<number, Evaluated[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const s of out) byChapter[s.chapter].push(s);
  const open = out.filter((s) => s.status !== "done");
  const next = open.slice(0, 10);

  const gate: Record<string, { count: number; need: number; have: number }> = {};
  for (const s of open.slice(0, 30)) {
    for (const ms of s.missingSkills) {
      const g = (gate[ms.skill] ??= { count: 0, need: 0, have: ms.have });
      g.count++;
      g.need = Math.max(g.need, ms.need);
    }
  }
  const bottlenecks = Object.entries(gate)
    .map(([skill, g]) => ({ skill: skill as SkillOrCombat, ...g }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const real = out.filter((s) => !s.synthetic);
  return {
    steps: out,
    byChapter,
    next,
    bottlenecks,
    progress: { done: real.filter((s) => s.status === "done").length, total: real.length },
  };
}

export function toMarkdown(result: GuideResult, rsn: string): string {
  const lines = [`# Iron Navigator guide — ${rsn}`, ""];
  for (const ch of CHAPTERS) {
    lines.push(`## Chapter ${ch.id}: ${ch.title}`, "");
    for (const s of result.byChapter[ch.id]) {
      lines.push(`- [${s.status === "done" ? "x" : " "}] **${s.id} ${s.title}** — ${s.instructions}`);
      if (s.missing.length && s.status !== "done") lines.push(`  - Needs: ${s.missing.join(", ")}`);
    }
    lines.push("");
  }
  lines.push("_Game data from the Old School RuneScape Wiki (CC BY-NC-SA 3.0). Not affiliated with Jagex._");
  return lines.join("\n");
}
