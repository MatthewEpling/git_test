import { NextResponse } from "next/server";
import { getHiscores, HiscoresError } from "@/lib/hiscores";
import type { AccountType } from "@/lib/types";

export const runtime = "nodejs";

const TYPES: AccountType[] = ["ironman", "hardcore", "ultimate", "group"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rsn = searchParams.get("rsn") ?? "";
  const typeParam = (searchParams.get("type") ?? "ironman") as AccountType;
  const type = TYPES.includes(typeParam) ? typeParam : "ironman";
  const force = searchParams.get("refresh") === "1";

  try {
    const data = await getHiscores(rsn, type, force);
    return NextResponse.json(data, {
      headers: { "Cache-Control": force ? "no-store" : "public, s-maxage=300, stale-while-revalidate=300" },
    });
  } catch (e) {
    const status = e instanceof HiscoresError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
