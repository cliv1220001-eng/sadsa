import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

// Load one tournament with its full saved payload.
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("tournaments")
      .select("id,name,data,created_at")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ tournament: data });
  } catch (e) {
    return errorResponse(e);
  }
}

// Delete a tournament.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const sb = getSupabase();
    const { error } = await sb.from("tournaments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
