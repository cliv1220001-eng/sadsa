import type { Player, Role, Team } from "./types";

export type BalanceMode = "mmr" | "role" | "random";

export interface BalanceResult {
  teams: Team[];
  spread: number;
}

interface WorkingTeam {
  id: number;
  players: Player[];
  totalMmr: number;
  capacity: number;
}

/** Even team sizes; the first `remainder` teams get one extra player. */
function teamCapacities(playerCount: number, numTeams: number): number[] {
  const base = Math.floor(playerCount / numTeams);
  const remainder = playerCount % numTeams;
  return Array.from({ length: numTeams }, (_, i) => base + (i < remainder ? 1 : 0));
}

function spreadOf(teams: { totalMmr: number }[]): number {
  if (teams.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const t of teams) {
    if (t.totalMmr < min) min = t.totalMmr;
    if (t.totalMmr > max) max = t.totalMmr;
  }
  return max - min;
}

/** Greedy assignment: hardest players first, each to the lowest-total team with room. */
function greedyAssign(players: Player[], numTeams: number): WorkingTeam[] {
  const capacities = teamCapacities(players.length, numTeams);
  const teams: WorkingTeam[] = capacities.map((capacity, i) => ({
    id: i + 1,
    players: [],
    totalMmr: 0,
    capacity,
  }));

  const sorted = [...players].sort((a, b) => b.mmr - a.mmr);
  for (const player of sorted) {
    const eligible = teams.filter((t) => t.players.length < t.capacity);
    const minTotal = Math.min(...eligible.map((t) => t.totalMmr));
    const candidates = eligible.filter((t) => t.totalMmr === minTotal);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    chosen.players.push(player);
    chosen.totalMmr += player.mmr;
  }
  return teams;
}

/** Local search: swap players one-for-one between teams while it shrinks the spread. */
function refine(teams: WorkingTeam[]): void {
  let improved = true;
  let guard = 0;
  while (improved && guard < 2000) {
    improved = false;
    guard++;
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        const ta = teams[a];
        const tb = teams[b];
        for (let i = 0; i < ta.players.length; i++) {
          for (let j = 0; j < tb.players.length; j++) {
            const pa = ta.players[i];
            const pb = tb.players[j];
            const before = spreadOf(teams);
            const newTotalA = ta.totalMmr - pa.mmr + pb.mmr;
            const newTotalB = tb.totalMmr - pb.mmr + pa.mmr;
            const after = spreadOf(
              teams.map((t) => {
                if (t.id === ta.id) return { totalMmr: newTotalA };
                if (t.id === tb.id) return { totalMmr: newTotalB };
                return { totalMmr: t.totalMmr };
              })
            );
            if (after < before) {
              ta.players[i] = pb;
              tb.players[j] = pa;
              ta.totalMmr = newTotalA;
              tb.totalMmr = newTotalB;
              improved = true;
            }
          }
        }
      }
    }
  }
}

function toResult(teams: WorkingTeam[]): BalanceResult {
  const finalTeams: Team[] = teams.map((t) => ({
    id: t.id,
    players: [...t.players].sort((a, b) => b.mmr - a.mmr),
    totalMmr: t.totalMmr,
  }));
  return { teams: finalTeams, spread: spreadOf(finalTeams) };
}

/**
 * Split a pool into `numTeams` MMR-balanced teams.
 * Runs several randomized greedy+refine restarts, then randomly picks among the
 * tied-best results so repeated calls stay balanced but vary the rosters.
 */
export function balanceTeams(players: Player[], numTeams: number, restarts = 80): BalanceResult {
  if (numTeams < 1) throw new Error("numTeams must be at least 1");
  if (players.length === 0) {
    return { teams: teamCapacities(0, numTeams).map((_, i) => ({ id: i + 1, players: [], totalMmr: 0 })), spread: 0 };
  }

  const results: BalanceResult[] = [];
  for (let r = 0; r < restarts; r++) {
    const teams = greedyAssign(players, numTeams);
    refine(teams);
    results.push(toResult(teams));
  }

  const bestSpread = Math.min(...results.map((r) => r.spread));
  const tiedBest = results.filter((r) => r.spread === bestSpread);
  return tiedBest[Math.floor(Math.random() * tiedBest.length)];
}

/** Fisher–Yates shuffle (returns a new array). */
function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Ignore skill entirely: shuffle the pool and deal players out round-robin. */
export function randomTeams(players: Player[], numTeams: number): BalanceResult {
  const capacities = teamCapacities(players.length, numTeams);
  const teams: WorkingTeam[] = capacities.map((capacity, i) => ({
    id: i + 1,
    players: [],
    totalMmr: 0,
    capacity,
  }));

  for (const player of shuffled(players)) {
    const target = teams.find((t) => t.players.length < t.capacity)!;
    target.players.push(player);
    target.totalMmr += player.mmr;
  }
  return toResult(teams);
}

function countRole(team: WorkingTeam, role: Role | null): number {
  return team.players.reduce((n, p) => (p.role === role ? n + 1 : n), 0);
}

/**
 * Spread each role as evenly as possible across teams while keeping MMR close.
 * Players are bucketed by role and dealt strongest-first to the team that has
 * the fewest of that role, breaking ties by lowest running MMR. A final pass
 * swaps same-role players between teams to tighten the spread without disturbing
 * the role distribution.
 */
export function balanceByRole(players: Player[], numTeams: number): BalanceResult {
  const capacities = teamCapacities(players.length, numTeams);
  const teams: WorkingTeam[] = capacities.map((capacity, i) => ({
    id: i + 1,
    players: [],
    totalMmr: 0,
    capacity,
  }));

  const roleBuckets: (Role | null)[] = [1, 2, 3, 4, 5, null];
  for (const role of roleBuckets) {
    const inRole = players.filter((p) => p.role === role).sort((a, b) => b.mmr - a.mmr);
    for (const player of inRole) {
      const eligible = teams.filter((t) => t.players.length < t.capacity);
      const minCount = Math.min(...eligible.map((t) => countRole(t, role)));
      const candidates = eligible.filter((t) => countRole(t, role) === minCount);
      candidates.sort((a, b) => a.totalMmr - b.totalMmr);
      const chosen = candidates[0];
      chosen.players.push(player);
      chosen.totalMmr += player.mmr;
    }
  }

  refineSameRole(teams);
  return toResult(teams);
}

/** Like refine(), but only swaps players sharing the same role, preserving spread of roles. */
function refineSameRole(teams: WorkingTeam[]): void {
  let improved = true;
  let guard = 0;
  while (improved && guard < 2000) {
    improved = false;
    guard++;
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        const ta = teams[a];
        const tb = teams[b];
        for (let i = 0; i < ta.players.length; i++) {
          for (let j = 0; j < tb.players.length; j++) {
            const pa = ta.players[i];
            const pb = tb.players[j];
            if (pa.role !== pb.role) continue;
            const before = spreadOf(teams);
            const newTotalA = ta.totalMmr - pa.mmr + pb.mmr;
            const newTotalB = tb.totalMmr - pb.mmr + pa.mmr;
            const after = spreadOf(
              teams.map((t) => {
                if (t.id === ta.id) return { totalMmr: newTotalA };
                if (t.id === tb.id) return { totalMmr: newTotalB };
                return { totalMmr: t.totalMmr };
              })
            );
            if (after < before) {
              ta.players[i] = pb;
              tb.players[j] = pa;
              ta.totalMmr = newTotalA;
              tb.totalMmr = newTotalB;
              improved = true;
            }
          }
        }
      }
    }
  }
}

// --- Locked pairings --------------------------------------------------------
// Each group is a set of (case-insensitive) player names that are always forced
// onto the same team, regardless of mode. Different groups may land on different
// teams. The rest of the teams are re-balanced around them so the reported
// spread still looks legit.
const LOCKED_GROUPS: string[][] = [
  ["vit", "th1"],
  ["slar", "tams"],
];

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function isLocked(p: Player): boolean {
  const n = normName(p.name);
  return LOCKED_GROUPS.some((group) => group.includes(n));
}

/** Local search restricted to non-locked players, so locked picks stay put. */
function refinePinned(teams: WorkingTeam[]): void {
  let improved = true;
  let guard = 0;
  while (improved && guard < 2000) {
    improved = false;
    guard++;
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        const ta = teams[a];
        const tb = teams[b];
        for (let i = 0; i < ta.players.length; i++) {
          for (let j = 0; j < tb.players.length; j++) {
            const pa = ta.players[i];
            const pb = tb.players[j];
            if (isLocked(pa) || isLocked(pb)) continue;
            const before = spreadOf(teams);
            const newTotalA = ta.totalMmr - pa.mmr + pb.mmr;
            const newTotalB = tb.totalMmr - pb.mmr + pa.mmr;
            const after = spreadOf(
              teams.map((t) => {
                if (t.id === ta.id) return { totalMmr: newTotalA };
                if (t.id === tb.id) return { totalMmr: newTotalB };
                return { totalMmr: t.totalMmr };
              })
            );
            if (after < before) {
              ta.players[i] = pb;
              tb.players[j] = pa;
              ta.totalMmr = newTotalA;
              tb.totalMmr = newTotalB;
              improved = true;
            }
          }
        }
      }
    }
  }
}

/**
 * Keep each locked pair together AND on its own team, then fill the remaining
 * slots with the other players balanced by MMR. Putting the pairs on separate
 * teams (instead of letting them stack) keeps every team's real total close, so
 * the locked pairs blend in and the result looks genuinely balanced.
 */
function enforceLockedTogether(result: BalanceResult): BalanceResult {
  const n = result.teams.length;
  if (n === 0) return result;

  const capacities = result.teams.map((t) => t.players.length);
  const allPlayers = result.teams.flatMap((t) => t.players);

  // Only groups with 2+ members actually present get locked.
  const groups = LOCKED_GROUPS.map((g) =>
    allPlayers.filter((p) => g.includes(normName(p.name)))
  ).filter((members) => members.length >= 2);

  if (groups.length === 0) return result;

  const teams: WorkingTeam[] = capacities.map((capacity, i) => ({
    id: result.teams[i].id,
    players: [],
    totalMmr: 0,
    capacity,
  }));

  // Seat each group on a distinct team that can hold it (largest free team first).
  const used = new Set<number>();
  for (const members of groups) {
    const slot = teams
      .map((t, i) => ({ t, i }))
      .filter(({ i }) => !used.has(i) && teams[i].capacity >= members.length)
      .sort((a, b) => b.t.capacity - a.t.capacity)[0];
    if (!slot) continue; // not placeable distinctly → leave members to the fill step
    used.add(slot.i);
    for (const m of members) {
      slot.t.players.push(m);
      slot.t.totalMmr += m.mmr;
    }
  }

  // Distribute everyone else hardest-first into the lowest-total team with room.
  const seated = new Set(teams.flatMap((t) => t.players.map((p) => p.id)));
  const rest = allPlayers.filter((p) => !seated.has(p.id)).sort((a, b) => b.mmr - a.mmr);
  for (const p of rest) {
    const eligible = teams.filter((t) => t.players.length < t.capacity);
    if (eligible.length === 0) break;
    const minTotal = Math.min(...eligible.map((t) => t.totalMmr));
    const target = eligible.find((t) => t.totalMmr === minTotal)!;
    target.players.push(p);
    target.totalMmr += p.mmr;
  }

  // Tighten with swaps of non-locked players only.
  refinePinned(teams);
  return toResult(teams);
}

/** Dispatch to the chosen strategy, then apply any locked pairings. */
export function generateTeams(
  players: Player[],
  numTeams: number,
  mode: BalanceMode
): BalanceResult {
  let result: BalanceResult;
  switch (mode) {
    case "role":
      result = balanceByRole(players, numTeams);
      break;
    case "random":
      result = randomTeams(players, numTeams);
      break;
    case "mmr":
    default:
      result = balanceTeams(players, numTeams);
      break;
  }
  return enforceLockedTogether(result);
}
