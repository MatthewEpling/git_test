"use client";
import { useState } from "react";
import type { Account } from "@/lib/account";
import type { ManualState } from "@/lib/storage";
import type { DiaryTier, QuestStatus, SkillName } from "@/lib/types";
import { SKILL_GRID, skillIcon, stageFor, wikiUrl } from "@/lib/skills";
import { DIARY_REGIONS, DIARY_TIERS, QUESTS, TOTAL_QP } from "@/lib/gamedata";
import { SHIP_TIERS, UNLOCKS } from "@/lib/unlocks";
import clogNotable from "@/data/clog-notable.json";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());

export function Mark({ v }: { v: boolean | "unknown" }) {
  if (v === "unknown") return <span title="Unknown — sync or tick manually" className="text-muted">?</span>;
  return v ? <span aria-label="yes">✅</span> : <span aria-label="no">❌</span>;
}

export function SkillsGrid({ account, blocking }: { account: Account; blocking: Set<string> }) {
  // Highlight the 5 lowest known skills, ignoring anything already 99.
  const lowest = new Set(
    [...SKILL_GRID]
      .filter((s) => account.levelKnown(s) && account.level(s) < 99)
      .sort((a, b) => account.level(a) - account.level(b))
      .slice(0, 5),
  );
  const hs = account.hiscores;
  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-lg font-bold">Skills</h2>
        <div className="text-sm text-muted">
          Total <b className="text-ink">{account.total}</b> · Combat <b className="text-ink">{account.combat}</b>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {SKILL_GRID.map((s: SkillName) => {
          const e = hs?.skills[s];
          const known = account.levelKnown(s);
          const isLow = lowest.has(s);
          const isBlock = blocking.has(s);
          return (
            <div
              key={s}
              title={`${s}${e?.xp != null ? ` — ${e.xp.toLocaleString()} XP, rank ${fmt(e.rank)}` : known ? "" : " — unranked on hiscores; sync WikiSync for the exact level"}`}
              className={`flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-1.5 sm:gap-2 sm:px-2 ${
                isBlock ? "border-bad/70 bg-bad/10" : isLow ? "border-warn/60 bg-warn/10" : "border-line bg-panel2"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={skillIcon(s)} alt="" width={20} height={20} className="h-5 w-5 object-contain" loading="lazy" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="font-pixel text-base">{known ? account.level(s) : "—"}</div>
                <div className="truncate text-[10px] text-muted sm:text-[11px]">
                  {e?.xp != null ? `${(e.xp / 1000).toFixed(e.xp < 10000 ? 1 : 0)}k xp` : known ? "synced" : "unranked"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <span><span className="inline-block h-2 w-2 rounded-sm bg-warn" /> 5 lowest</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-bad" /> blocking your next steps</span>
        <span>“—” = unranked on hiscores (level unknown)</span>
      </p>
    </section>
  );
}

export function StageBadge({ account }: { account: Account }) {
  const stage = stageFor(account.total, account.questPoints);
  return (
    <div className="card flex flex-col items-center justify-center text-center">
      <p className="label">Account stage</p>
      <p className="mt-1 font-display text-2xl font-bold text-gold">{stage}</p>
      <p className="mt-1 text-xs text-muted">
        From total level{account.questPoints !== null ? " and quest points" : " (sync quests to refine)"}
      </p>
    </div>
  );
}

export function QuestPanel({ account, onManual }: { account: Account; onManual: (name: string, s: QuestStatus | null) => void }) {
  const [tab, setTab] = useState<QuestStatus>("not_started");
  const names = Object.keys(QUESTS).sort();
  const groups: Record<QuestStatus | "unknown", string[]> = { done: [], in_progress: [], not_started: [], unknown: [] };
  for (const n of names) groups[account.quest(n)].push(n);
  const qp = account.questPoints;
  const pct = qp !== null ? Math.round((qp / TOTAL_QP) * 100) : null;
  const unknownAll = !account.hasQuestData;

  return (
    <section className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Quests</h2>
        <span className="text-sm text-muted">
          {qp !== null ? (
            <>
              <b className="text-ink">{qp}</b>/{TOTAL_QP} QP · {pct}%
            </>
          ) : (
            "QP unknown"
          )}
        </span>
      </div>
      {pct !== null && (
        <div className="mb-3 h-2 overflow-hidden rounded bg-panel2">
          <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
      )}
      {unknownAll ? (
        <p className="text-sm text-muted">Quest progress isn't on the hiscores. Paste your WikiSync data below, or tick quests off by hand from the list.</p>
      ) : null}
      <div className="mb-2 mt-2 flex flex-wrap gap-1.5">
        {(["not_started", "in_progress", "done"] as QuestStatus[]).map((t) => (
          <button key={t} className={`chip text-xs ${tab === t ? "chip-on" : ""}`} onClick={() => setTab(t)}>
            {t === "done" ? "Completed" : t === "in_progress" ? "In progress" : unknownAll ? "All quests" : "Not started"} (
            {t === "not_started" ? groups.not_started.length + groups.unknown.length : groups[t].length})
          </button>
        ))}
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto pr-1 text-sm">
        {(tab === "not_started" ? [...groups.not_started, ...groups.unknown] : groups[tab]).map((n) => (
          <li key={n} className="flex items-center justify-between gap-2 rounded px-1 hover:bg-panel2">
            <a href={wikiUrl(n)} target="_blank" rel="noreferrer" className="truncate hover:text-gold">
              {n}
            </a>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
              {QUESTS[n].qp} QP
              {!account.sync && (
                <button
                  className="rounded border border-line px-1.5 hover:border-gold"
                  onClick={() => onManual(n, account.quest(n) === "done" ? null : "done")}
                  title="Manual mode: mark complete"
                >
                  {account.quest(n) === "done" ? "undo" : "done"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DiaryGrid({ account, onManual }: { account: Account; onManual: (key: string, v: boolean) => void }) {
  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-bold">Achievement diaries</h2>
      <div className="overflow-x-auto">
        <table className="h-fit w-full self-start text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">Region</th>
              {DIARY_TIERS.map((t) => (
                <th key={t} className="py-1 text-center font-medium">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIARY_REGIONS.map((r) => (
              <tr key={r} className="border-t border-line/60">
                <td className="py-1.5 pr-2">{r}</td>
                {DIARY_TIERS.map((t: DiaryTier) => {
                  const key = `${r} ${t}`;
                  const v = account.diary(key);
                  const prog = account.sync?.diaries[r]?.[t];
                  return (
                    <td key={t} className="py-1.5 text-center">
                      <button
                        disabled={Boolean(account.sync)}
                        onClick={() => onManual(key, v !== true)}
                        title={prog ? `${prog.done}/${prog.total} tasks` : account.sync ? "" : "Click to toggle (manual mode)"}
                        className="disabled:cursor-default"
                      >
                        <Mark v={v} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!account.hasDiaryData && <p className="mt-2 text-xs text-muted">“?” means we don't know yet. Sync WikiSync or click to tick by hand.</p>}
    </section>
  );
}

export function UnlocksCard({
  account,
  manual,
  setManual,
}: {
  account: Account;
  manual: ManualState;
  setManual: (fn: (m: ManualState) => ManualState) => void;
}) {
  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-bold">Key unlocks</h2>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {UNLOCKS.map((u) => {
          const v = u.check(account);
          return (
            <li key={u.id} className="flex items-center justify-between gap-2 border-b border-line/40 py-1">
              <span className="truncate" title={u.how}>
                {u.label}
              </span>
              {u.manual ? (
                <button
                  className="text-base"
                  title="Not trackable automatically — click to toggle"
                  onClick={() =>
                    setManual((m) => ({ ...m, unlocks: { ...m.unlocks, [u.id]: !(m.unlocks[u.id] ?? false) } }))
                  }
                >
                  <Mark v={v} />
                </button>
              ) : (
                <Mark v={v} />
              )}
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-2 border-b border-line/40 py-1">
          <span>Current ship</span>
          <select
            className="rounded border border-line bg-panel2 px-1 py-0.5 text-xs"
            value={manual.shipTier ?? ""}
            onChange={(e) => setManual((m) => ({ ...m, shipTier: e.target.value || undefined }))}
          >
            <option value="">Unknown</option>
            {SHIP_TIERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted">Items like Graceful or the Slayer helm can't be read from hiscores or WikiSync quests — tick them yourself.</p>
    </section>
  );
}

export function BottlenecksCard({ items }: { items: { skill: string; count: number; need: number; have: number }[] }) {
  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-bold">Bottlenecks</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No skill is gating your next 30 steps. Nice.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((b) => (
            <li key={b.skill} className="flex items-center gap-2">
              {b.skill !== "Combat" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={skillIcon(b.skill)} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
              )}
              <span>
                <b>{b.skill}</b> is gating {b.count} of your next steps — highest need {b.need} (you have {b.have}).
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ActivitiesCard({ account }: { account: Account }) {
  const acts = account.hiscores?.activities ?? [];
  const clues = acts.filter((a) => a.name.toLowerCase().startsWith("clue"));
  const bosses = acts.filter(
    (a) => !a.name.toLowerCase().startsWith("clue") && !/points|rank|zeal|glory|collections|bounty|rifts/i.test(a.name),
  );
  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-bold">Boss KC & clues</h2>
      {acts.length === 0 ? (
        <p className="text-sm text-muted">No ranked boss kills or clues yet. Hiscores only list a boss once you pass its kill-count threshold.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <table className="h-fit w-full self-start text-sm">
            <tbody>
              {bosses.map((b) => (
                <tr key={b.name} className="border-b border-line/40">
                  <td className="py-1">{b.name}</td>
                  <td className="py-1 text-right font-pixel">{b.score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="h-fit w-full self-start text-sm">
            <tbody>
              {clues.map((b) => (
                <tr key={b.name} className="border-b border-line/40">
                  <td className="py-1">{b.name.replace("Clue Scrolls ", "Clues ")}</td>
                  <td className="py-1 text-right font-pixel">{b.score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ClogCard({ account }: { account: Account }) {
  const fromHs = account.hiscores?.activities.find((a) => a.name === "Collections Logged")?.score ?? null;
  const count = account.sync?.collectionLogCount ?? fromHs;
  const have = new Set(account.sync?.collectionLog ?? []);
  const hasList = have.size > 0;
  const missing = (clogNotable.items as { name: string; ids: number[]; wiki: string }[]).filter(
    (i) => !i.ids.some((id) => have.has(id)),
  );
  return (
    <section className="card">
      <h2 className="mb-2 text-lg font-bold">Collection log</h2>
      <p className="text-sm">
        Slots filled: <b className="font-pixel text-base">{count !== null ? count.toLocaleString() : "unknown"}</b>
        {count === null && <span className="text-muted"> — sync WikiSync (open the log in-game first)</span>}
      </p>
      {hasList ? (
        missing.length ? (
          <>
            <p className="label mt-3">Notable early items not logged</p>
            <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {missing.map((m) => (
                <li key={m.name}>
                  <a href={m.wiki} target="_blank" rel="noreferrer" className="chip text-xs hover:text-gold">
                    {m.name}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-good">All tracked early-game items logged.</p>
        )
      ) : (
        <p className="mt-2 text-xs text-muted">Missing-item check needs your WikiSync collection log export.</p>
      )}
    </section>
  );
}
