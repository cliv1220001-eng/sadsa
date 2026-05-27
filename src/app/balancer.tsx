"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { generateTeams, type BalanceMode, type BalanceResult } from "@/lib/balance";
import { saveTeams, usePersistentState } from "@/lib/store";
import { ROLE_LABELS, type Player, type Role } from "@/lib/types";

interface DraftPlayer {
  id: string;
  name: string;
  mmr: string;
  role: Role | null;
}

const ROLES: Role[] = [1, 2, 3, 4, 5];

const MODES: { key: BalanceMode; label: string; hint: string; icon: string }[] = [
  { key: "mmr", label: "Balance MMR", hint: "Closest total MMR", icon: "⚖️" },
  { key: "role", label: "Spread Roles", hint: "Even roles + MMR", icon: "🎯" },
  { key: "random", label: "Random", hint: "Pure chaos", icon: "🎲" },
];

const TEAM_ACCENTS = [
  "#c45bff",
  "#e38bff",
  "#9d4edd",
  "#ff7ac6",
  "#b388ff",
];

// Newly-added rows get a collision-proof id (restored rows keep their stored ids).
function makeRow(): DraftPlayer {
  return { id: crypto.randomUUID(), name: "", mmr: "", role: null };
}
// Default rows use deterministic ids so server and client first render match.
function blankRows(n: number): DraftPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `row-${i}`, name: "", mmr: "", role: null }));
}

interface BalancerSession {
  rows: DraftPlayer[];
  mode: BalanceMode;
  result: BalanceResult | null;
}

const SESSION_KEY = "dota-balancer:session";
const DEFAULT_SESSION: BalancerSession = { rows: blankRows(10), mode: "mmr", result: null };

function parseRole(token: string | undefined): Role | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  if (!t) return null;
  const num = parseInt(t, 10);
  if (num >= 1 && num <= 5) return num as Role;
  if (t.includes("carry") || t.includes("safe") || t === "pos 1") return 1;
  if (t.includes("mid")) return 2;
  if (t.includes("off")) return 3;
  if (t.includes("soft") || t.includes("pos 4")) return 4;
  if (t.includes("hard") || t.includes("pos 5")) return 5;
  if (t.includes("sup")) return 4;
  return null;
}

/** Parse pasted spreadsheet rows: "Name<TAB>MMR<TAB>Role" (also accepts comma or space). */
function parseBulk(text: string): { name: string; mmr: string; role: Role | null }[] {
  const out: { name: string; mmr: string; role: Role | null }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let cols: string[];
    if (line.includes("\t")) cols = line.split("\t");
    else if (line.includes(",")) cols = line.split(",");
    else {
      const m = line.match(/^(.*?)\s+(\d{1,5})\s*(.*)$/);
      cols = m ? [m[1], m[2], m[3]] : [line];
    }
    cols = cols.map((c) => c.trim());

    const name = cols[0];
    if (!name) continue;
    // Skip a header row like "Players | MMR | Role".
    if (/^players?$/i.test(name) && /mmr/i.test(cols[1] ?? "")) continue;

    const mmr = (cols[1] ?? "").replace(/[^0-9]/g, "").slice(0, 5);
    out.push({ name, mmr, role: parseRole(cols[2]) });
  }
  return out;
}

export default function Balancer() {
  const router = useRouter();
  // Persisted across reloads (roster, chosen mode, last result).
  const [session, setSession] = usePersistentState<BalancerSession>(SESSION_KEY, DEFAULT_SESSION);
  const { rows, mode, result } = session;
  const setRows = (updater: DraftPlayer[] | ((prev: DraftPlayer[]) => DraftPlayer[])) =>
    setSession((s) => ({ ...s, rows: typeof updater === "function" ? updater(s.rows) : updater }));
  const setMode = (next: BalanceMode) => setSession((s) => ({ ...s, mode: next }));
  const setResult = (next: BalanceResult | null) => setSession((s) => ({ ...s, result: next }));

  // Transient UI state (not persisted).
  const [shuffleKey, setShuffleKey] = useState(0);
  const [shuffling, setShuffling] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const ready = useMemo(
    () =>
      rows.filter(
        (r) => r.name.trim() !== "" && r.mmr.trim() !== "" && !Number.isNaN(Number(r.mmr))
      ),
    [rows]
  );

  // Dota teams are 5 players each — the team count follows the player count.
  const TEAM_SIZE = 5;
  const playerCount = ready.length;
  const numTeams = Math.floor(playerCount / TEAM_SIZE);
  const remainder = playerCount % TEAM_SIZE;
  const canGenerate = numTeams >= 2;

  const teamNote: { tone: "info" | "warn" | "ok"; text: string } = (() => {
    if (playerCount === 0) {
      return { tone: "info", text: "Add players to get started — 5 per team." };
    }
    if (numTeams < 2) {
      const need = 2 * TEAM_SIZE - playerCount;
      return {
        tone: "warn",
        text: `Add ${need} more ${need === 1 ? "player" : "players"} to form 2 teams.`,
      };
    }
    if (remainder !== 0) {
      const need = TEAM_SIZE - remainder;
      return {
        tone: "warn",
        text: `Add ${need} more ${need === 1 ? "player" : "players"} to make ${numTeams + 1} teams.`,
      };
    }
    return { tone: "ok", text: `${numTeams} even teams of ${TEAM_SIZE}.` };
  })();

  function update(id: string, patch: Partial<DraftPlayer>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, makeRow()]);
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function applyBulk() {
    const parsed = parseBulk(bulkText);
    if (parsed.length === 0) {
      setBulkOpen(false);
      return;
    }
    const added = parsed.map((p) => ({ ...makeRow(), name: p.name, mmr: p.mmr, role: p.role }));
    setRows((prev) => {
      const filled = prev.filter((r) => r.name.trim() !== "" || r.mmr.trim() !== "");
      return [...filled, ...added];
    });
    setBulkText("");
    setBulkOpen(false);
  }
  function reset() {
    setRows(blankRows(10));
    setResult(null);
  }

  function generate() {
    if (!canGenerate || shuffling) return;
    const players: Player[] = ready.map((r) => ({
      id: r.id,
      name: r.name.trim(),
      mmr: Math.round(Number(r.mmr)),
      role: r.role,
    }));
    // Brief loading beat so the shuffle is visibly "working".
    setShuffling(true);
    window.setTimeout(() => {
      setResult(generateTeams(players, numTeams, mode));
      setShuffleKey((k) => k + 1);
      setShuffling(false);
    }, 1000);
  }

  function sendToBracket() {
    if (!result) return;
    saveTeams(result.teams);
    router.push("/bracket");
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-3 text-center sm:text-left">
        <h1 className="gradient-text text-4xl font-extrabold tracking-tight sm:text-5xl">
          Build Balanced Teams
        </h1>
        <p className="max-w-xl text-zinc-400">
          Drop in your players with their MMR and role, pick how to split them, then push the
          rosters straight into a tournament bracket.
        </p>
      </header>

      {/* Mode selector */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`panel flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                active
                  ? "ring-2 ring-[var(--lg-primary)] shadow-[0_0_28px_-8px_var(--lg-primary)]"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              <span className="text-2xl">{m.icon}</span>
              <span className="flex flex-col">
                <span className="font-semibold">{m.label}</span>
                <span className="text-xs text-zinc-400">{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Player roster input */}
      <section className="panel flex flex-col gap-1.5 rounded-2xl p-4">
        <div className="grid grid-cols-[1fr_5.5rem_8.5rem_2rem] gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <span>Player</span>
          <span>MMR</span>
          <span>Role</span>
          <span />
        </div>

        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_5.5rem_8.5rem_2rem] gap-1.5">
            <input
              value={row.name}
              onChange={(e) => update(row.id, { name: e.target.value })}
              placeholder="Player name"
              className="field rounded-md px-2.5 py-1.5 text-[13px]"
            />
            <input
              value={row.mmr}
              onChange={(e) =>
                update(row.id, { mmr: e.target.value.replace(/[^0-9]/g, "").slice(0, 5) })
              }
              inputMode="numeric"
              maxLength={5}
              placeholder="MMR"
              className="field rounded-md px-2.5 py-1.5 text-[13px] tabular-nums"
            />
            <select
              value={row.role ?? ""}
              onChange={(e) =>
                update(row.id, { role: e.target.value ? (Number(e.target.value) as Role) : null })
              }
              className="field rounded-md px-1.5 py-1.5 text-[13px]"
            >
              <option value="">Any role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}. {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeRow(row.id)}
              aria-label="Remove player"
              className="field rounded-md text-xs text-zinc-500 transition-colors hover:border-red-400 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={addRow}
            className="text-sm font-semibold text-[var(--lg-glow)] transition-opacity hover:opacity-80"
          >
            + Add player
          </button>
          <button
            onClick={() => setBulkOpen((o) => !o)}
            className="text-sm font-semibold text-[var(--lg-lavender)] transition-opacity hover:opacity-80"
          >
            📋 Bulk add
          </button>
        </div>

        {bulkOpen && (
          <div className="animate-fade-up flex flex-col gap-2 rounded-xl border border-[var(--panel-border)] bg-white/[0.02] p-3">
            <p className="text-xs text-zinc-400">
              Paste rows from Google Sheets / Excel — columns:{" "}
              <span className="text-zinc-300">Name · MMR · Role</span> (tab or comma separated, role
              optional).
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={"leunibers\t6000\ncarry Jay\t3700\t1\nJULIA MAE\t1900"}
              className="field min-h-32 w-full rounded-lg px-3 py-2 font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setBulkOpen(false);
                  setBulkText("");
                }}
                className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={applyBulk}
                disabled={bulkText.trim() === ""}
                className="btn-neon rounded-full px-5 py-2 text-sm"
              >
                Add players
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Teams</span>
            <span className="rounded-lg border border-[var(--panel-border)] bg-white/[0.03] px-3 py-1.5 text-base font-extrabold tabular-nums text-[var(--lg-glow)]">
              {numTeams}
            </span>
            <span className="text-zinc-500">
              · <span className="font-semibold text-zinc-300">{playerCount}</span> players · 5 per
              team
            </span>
          </div>

          <div className="ml-auto flex gap-2">
            <button
              onClick={reset}
              className="rounded-full border border-[var(--panel-border)] px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/5"
            >
              Reset
            </button>
            <button
              onClick={generate}
              disabled={!canGenerate || shuffling}
              className="btn-neon flex items-center gap-2 rounded-full px-6 py-2.5 text-sm"
            >
              {shuffling && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {shuffling ? "Shuffling…" : result ? "Reshuffle" : "Generate Teams"}
            </button>
          </div>
        </div>

        {/* Auto team-count status */}
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            teamNote.tone === "warn"
              ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
              : teamNote.tone === "ok"
                ? "border-[var(--panel-border)] bg-[var(--lg-primary)]/10 text-[var(--lg-glow)]"
                : "border-[var(--panel-border)] text-zinc-400"
          }`}
        >
          <span>{teamNote.tone === "warn" ? "⚠️" : teamNote.tone === "ok" ? "✓" : "ℹ️"}</span>
          <span>{teamNote.text}</span>
        </div>
      </div>

      {/* Results */}
      {result && (
        <section key={shuffleKey} className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">
              MMR spread:{" "}
              <span className="font-bold text-[var(--lg-glow)]">{result.spread}</span>
              <span className="ml-2 text-zinc-600">·</span>
              <span className="ml-2 capitalize text-zinc-500">{mode} mode</span>
            </p>
            <button onClick={sendToBracket} className="btn-neon rounded-full px-6 py-2.5 text-sm">
              Send to Bracket →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {result.teams.map((team, i) => {
              const accent = TEAM_ACCENTS[i % TEAM_ACCENTS.length];
              return (
                <div
                  key={team.id}
                  className="panel animate-pop rounded-xl p-3.5"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    borderColor: accent,
                    boxShadow: `0 0 22px -12px ${accent}`,
                  }}
                >
                  <div className="mb-2.5 flex items-baseline justify-between gap-1">
                    <h2 className="text-base font-extrabold" style={{ color: accent }}>
                      Team {team.id}
                    </h2>
                    <span className="text-[11px] font-bold tabular-nums text-zinc-200">
                      {team.totalMmr}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {team.players.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="flex items-center gap-1.5 truncate">
                          {p.role && (
                            <span
                              title={`${p.role}. ${ROLE_LABELS[p.role]}`}
                              className="shrink-0 rounded bg-white/10 px-1 text-[10px] font-bold tabular-nums text-zinc-300"
                            >
                              {p.role}
                            </span>
                          )}
                          <span className="truncate font-medium">{p.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-400">{p.mmr}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
