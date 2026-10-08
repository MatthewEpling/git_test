"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import PlayerNav, { rsnFromParam } from "@/components/PlayerNav";
import StepCard, { CATEGORY } from "@/components/StepCard";
import CoachPanel from "@/components/CoachPanel";
import { usePlayer } from "@/lib/usePlayer";
import { CHAPTERS, evaluateGuide, toMarkdown } from "@/lib/engine";
import { useBranches, useChecked } from "@/lib/storage";

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-panel2" aria-label={`${pct}% complete`}>
      <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Guide() {
  const params = useParams<{ rsn: string }>();
  const search = useSearchParams();
  const rsn = rsnFromParam(params.rsn);
  const p = usePlayer(rsn, search.get("type"));
  const [checked, setChecked] = useChecked(rsn);
  const [branches, setBranches] = useBranches(rsn);
  const [chapter, setChapter] = useState<number | null>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const guide = useMemo(() => evaluateGuide(p.account, p.settings, checked, branches), [p.account, p.settings, checked, branches]);

  // Start on the chapter of the first incomplete step.
  useEffect(() => {
    if (chapter === null && guide.next[0]) setChapter(guide.next[0].chapter);
  }, [guide, chapter]);
  const active = chapter ?? 1;

  const onToggle = (id: string, value: boolean | null) =>
    setChecked((c) => {
      const n = { ...c };
      if (value === null) delete n[id];
      else n[id] = value;
      return n;
    });
  const onBranch = (id: string, i: number) => setBranches((b) => ({ ...b, [id]: i }));

  const visible = guide.byChapter[active].filter(
    (s) => (showDone || s.status !== "done") && (filters.size === 0 || filters.has(s.category)),
  );

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(guide, rsn));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Couldn't access the clipboard in this browser.");
    }
  };

  const accountType = p.settings?.accountType ?? p.type;

  return (
    <div>
      <PlayerNav rsn={rsn} type={accountType} />

      {!p.account.hasQuestData && (
        <div className="card no-print mb-4 border-warn/60 text-sm">
          Quest and diary steps can't be auto-ticked until you{" "}
          <Link href={`/player/${params.rsn}`} className="text-gold underline">
            sync WikiSync or tick them on your snapshot
          </Link>
          . Until then they show as “not synced” — tick them here as you go.
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card min-w-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Next 10 steps</h2>
            <span className="text-sm text-muted">
              {guide.progress.done}/{guide.progress.total} done
            </span>
          </div>
          <Bar done={guide.progress.done} total={guide.progress.total} />
          <ol className="mt-3 space-y-1 text-sm">
            {guide.next.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.status === "ready" ? "bg-good" : "bg-bad"}`} />
                <button
                  className="truncate text-left hover:text-gold"
                  onClick={() => {
                    setChapter(s.chapter);
                    setTimeout(() => document.getElementById(`step-${s.id}`)?.scrollIntoView({ behavior: "smooth" }), 50);
                  }}
                >
                  <span aria-hidden>{CATEGORY[s.category]?.icon}</span> {s.title}
                </button>
              </li>
            ))}
            {guide.next.length === 0 && <li className="text-good">Everything in the guide is done. Legend.</li>}
          </ol>
        </section>
        <CoachPanel rsn={rsn} account={p.account} settings={p.settings} guide={guide} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)] print:hidden">
        <aside className="no-print min-w-0 md:sticky md:top-20 md:self-start">
          <nav className="flex gap-2 overflow-x-auto md:flex-col">
            {CHAPTERS.map((c) => {
              const steps = guide.byChapter[c.id].filter((s) => !s.synthetic);
              const done = steps.filter((s) => s.status === "done").length;
              return (
                <button
                  key={c.id}
                  onClick={() => setChapter(c.id)}
                  className={`min-w-[160px] rounded-lg border p-3 text-left transition ${
                    active === c.id ? "border-gold bg-gold/10" : "border-line bg-panel hover:border-gold/50"
                  }`}
                >
                  <span className="label">Chapter {c.id}</span>
                  <span className="block font-display font-semibold">{c.title}</span>
                  <span className="mb-1 block text-xs text-muted">
                    {done}/{steps.length}
                  </span>
                  <Bar done={done} total={steps.length} />
                </button>
              );
            })}
          </nav>
        </aside>

        <div>
          <div className="no-print mb-3 flex flex-wrap items-center gap-2">
            {Object.entries(CATEGORY).map(([k, v]) => (
              <button
                key={k}
                className={`chip text-xs ${filters.has(k) ? "chip-on" : ""}`}
                onClick={() =>
                  setFilters((f) => {
                    const n = new Set(f);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                  })
                }
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[rgb(var(--gold))]" />
              Show completed
            </label>
            <button className="btn-ghost" onClick={() => window.print()}>
              🖨 Print
            </button>
            <button className="btn-ghost" onClick={copyMd}>
              {copied ? "Copied!" : "⧉ Copy as markdown"}
            </button>
          </div>

          <h2 className="mb-1 text-2xl font-bold">
            Chapter {active}: {CHAPTERS[active - 1].title}
          </h2>
          <p className="mb-4 text-sm text-muted">{CHAPTERS[active - 1].blurb}</p>

          <div className="space-y-3">
            {visible.map((s) => (
              <StepCard key={s.id} step={s} accountType={accountType} onToggle={onToggle} onBranch={onBranch} />
            ))}
            {visible.length === 0 && (
              <div className="card text-sm text-muted">
                Nothing to show here{filters.size ? " with these filters" : ""}.{" "}
                {!showDone && "Tick “Show completed” to see finished steps."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print view: every open step across all chapters */}
      <div className="hidden print:block">
        <h2 className="mb-2 text-xl font-bold">Iron Navigator guide — {rsn}</h2>
        {CHAPTERS.map((c) => (
          <section key={c.id} className="mb-4">
            <h3 className="mb-1 text-lg font-bold">
              Chapter {c.id}: {c.title}
            </h3>
            <ul className="space-y-1 text-sm">
              {guide.byChapter[c.id]
                .filter((s) => showDone || s.status !== "done")
                .map((s) => (
                  <li key={s.id}>
                    ☐ <b>{s.synthetic ? "+" : s.id} {s.title}</b> — {s.instructions}
                    {s.status === "blocked" && s.missing.length > 0 && <em> (needs {s.missing.join(", ")})</em>}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <Suspense>
      <Guide />
    </Suspense>
  );
}
