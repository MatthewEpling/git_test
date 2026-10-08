import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Layer 2 — optional AI coach. Key stays on the server (ANTHROPIC_API_KEY).
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_BODY = 40_000;

// Simple in-memory rate limit: 8 requests per 10 minutes per IP.
// On Vercel each instance has its own memory; swap for Upstash/Vercel KV if you need a hard global limit.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 8;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    hits.set(ip, list);
    return Math.ceil((WINDOW_MS - (now - list[0])) / 1000);
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return 0;
}

const SYSTEM = `You are the Iron Navigator coach for Old School RuneScape Ironman accounts.

Rules you must follow:
- Use ONLY the account data and guide output in the <account> block. Never invent levels, quest completions, items, kill counts or unlocks.
- If something you'd need is missing or marked unknown/not synced, say so plainly and suggest syncing WikiSync instead of guessing.
- Recommend steps from the provided guide output (refer to them by their id and title). You may add general OSRS advice, but label it as general.
- Respect the account type: flag dangerous content for Hardcore, no-bank constraints for Ultimate, and splitting work for Group.
- Be concise and practical. Use short paragraphs and "- " bullet lists. No tables. No headings other than the ones you're asked for.
- The Sailing skill exists (released November 2025). Treat the guide's Sailing steps as authoritative.`;

type Body = {
  mode: "summary" | "chat";
  question?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  snapshot: unknown;
};

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "The AI coach isn't configured on this site (missing ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const wait = rateLimited(ip);
  if (wait) return NextResponse.json({ error: `Coach is resting. Try again in ${Math.ceil(wait / 60)} min.` }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });

  let body: Body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body.snapshot || (body.mode !== "summary" && body.mode !== "chat")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const context = `<account>\n${JSON.stringify(body.snapshot)}\n</account>`;
  const ask =
    body.mode === "summary"
      ? `${context}\n\nWrite three short sections with these exact headings on their own lines:\nRecommended path\n(one paragraph: what this player should focus on next and why, given their goal, playstyle and hours per day)\nWhy now\n(3–5 bullets, each tied to a specific upcoming step id)\nBranch picks\n(one bullet per open branch point in the guide output, recommending an option for this player's playstyle and goal)`
      : `${context}\n\nPlayer question: ${String(body.question ?? "").slice(0, 600)}`;

  const history = (body.history ?? [])
    .slice(-6)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: SYSTEM,
        messages: [...(body.mode === "chat" ? history : []), { role: "user", content: ask }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("coach error", res.status, json?.error?.message);
      return NextResponse.json({ error: "The coach couldn't answer right now." }, { status: 502 });
    }
    const text = (json.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ text });
  } catch (e) {
    console.error("coach exception", e);
    return NextResponse.json({ error: "The coach timed out. Try again." }, { status: 504 });
  }
}
