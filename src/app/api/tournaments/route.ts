import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

// List saved tournaments (name + date only — not the full payload).
export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("tournaments")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ tournaments: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

// Create a new tournament from the current balancer session.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; data?: unknown };
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Tournament name is required." }, { status: 400 });
    }
    const sb = getSupabase();
    const { data, error } = await sb
      .from("tournaments")
      .insert({ name, data: body.data ?? {} })
      .select("id,name,created_at")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ tournament: data });
  } catch (e) {
    return errorResponse(e);
  }
}
