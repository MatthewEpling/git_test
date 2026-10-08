"use client";
import { Fragment, useState } from "react";
import type { Account } from "@/lib/account";
import type { GuideResult } from "@/lib/engine";
import type { Settings } from "@/lib/types";
import { SKILL_GRID } from "@/lib/skills";
import { UNLOCKS } from "@/lib/unlocks";

type Msg = { role: "user" | "assistant"; content: string };

/** Compact, factual snapshot sent to the coach. Unknowns are labelled, never filled in. */
function buildSnapshot(rsn: string, account: Account, settings: Settings | null, guide: GuideResult) {
  const levels: Record<string, number | string> = {};
  for (const s of SKILL_GRID) levels[s] = account.levelKnown(s) ? account.level(s) : "unknown (unranked)";
  const questsDone = account.sync
    ? Object.entries(account.sync.quests).filter(([, v]) => v === "done").map(([k]) => k)
    : Object.entries(account.manual.quests).filter(([, v]) => v === "done").map(([k]) => k);
  const unlocks: Record<string, string> = {};
  for (const u of UNLOCKS) {
    const v = u.check(account);
    unlocks[u.label] = v === "unknown" ? "unknown" : v ? "yes" : "no";
  }
  const open = guide.steps.filter((s) => s.status !== "done").slice(0, 15);
  return {
    rsn,
    accountType: settings?.accountType ?? account.hiscores?.requestedType ?? "unknown",
    settings: settings ?? "not set",
    combatLevel: account.combat,
    totalLevel: account.total,
    levels,
    questDataSource: account.sync ? "WikiSync" : account.hasQuestData ? "manual" : "none — quest progress unknown",
    questPoints: account.questPoints ?? "unknown",
    questsCompleted: questsDone.length ? questsDone : "unknown",
    keyUnlocks: unlocks,
    bottlenecks: guide.bottlenecks,
    progress: guide.progress,
    upcomingSteps: open.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      needs: s.missing,
      whyNow: s.whyNow,
      branch: s.branch ? { options: s.branch.options.map((o) => `${o.label} (${o.style})`), chosen: s.chosenBranch } : undefined,
    })),
  };
}

function Rich({ text }: { text: string }) {
  const bold = (t: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
    );
  return (
    <div className="space-y-1.5 text-sm">
      {text.split("\n").filter(Boolean).map((line, i) => {
        if (/^(Recommended path|Why now|Branch picks)\s*:?$/i.test(line.trim()))
          return <p key={i} className="label pt-1 text-gold">{line.replace(/:$/, "")}</p>;
        if (/^\s*[-*•]\s/.test(line)) return <p key={i} className="pl-3 before:mr-1.5 before:content-['•']">{bold(line.replace(/^\s*[-*•]\s/, ""))}</p>;
        return <p key={i}>{bold(line.replace(/^#+\s*/, ""))}</p>;
      })}
    </div>
  );
}

export default function CoachPanel({
  rsn,
  account,
  settings,
  guide,
}: {
  rsn: string;
  account: Account;
  settings: Settings | null;
  guide: GuideResult;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const call = async (mode: "summary" | "chat", question?: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, question, history: msgs, snapshot: buildSnapshot(rsn, account, settings, guide) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Coach error");
      return json.text as string;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Coach error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card no-print flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">AI coach</h2>
        <span className="text-xs text-muted">uses only your data</span>
      </div>
      {!summary ? (
        <button
          className="btn mt-3"
          disabled={busy}
          onClick={async () => {
            const t = await call("summary");
            if (t) setSummary(t);
          }}
        >
          {busy && !msgs.length ? "Thinking…" : "Get my recommended path"}
        </button>
      ) : (
        <div className="mt-2 max-h-72 overflow-y-auto pr-1">
          <Rich text={summary} />
        </div>
      )}

      {msgs.length > 0 && (
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto border-t border-line pt-3 pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              {m.role === "user" ? (
                <span className="inline-block rounded-lg bg-gold/15 px-2 py-1 text-sm">{m.content}</span>
              ) : (
                <Rich text={m.content} />
              )}
            </div>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const question = q.trim();
          if (!question) return;
          setQ("");
          setMsgs((m) => [...m, { role: "user", content: question }]);
          const t = await call("chat", question);
          if (t) setMsgs((m) => [...m, { role: "assistant", content: t }]);
        }}
      >
        <input className="input text-sm" placeholder="What should I do with 2 hours tonight?" value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} />
        <button className="btn-ghost shrink-0" disabled={busy || !q.trim()}>
          Ask
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </section>
  );
}
