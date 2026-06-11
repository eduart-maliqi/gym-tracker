import {
  MUSCLE_GROUPS,
  getMealsInRange,
  getWorkoutsInRange,
  type Intensity,
  type Workout,
  type Settings,
} from "./db";
import { addDays, fmtDate, today, weekStart } from "./dates";

export interface GroupStat {
  name: string;
  hart: number;
  mittel: number;
  leicht: number;
  total: number;
}

export interface MonthStats {
  month: string;
  gymVisits: number;
  daysInRange: number;
  groups: GroupStat[];
  untrained: string[];
  visitsThisWeek: number;
  weekStreak: number;
  avgKcal: number | null;
  avgProtein: number | null;
  daysTracked: number;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const cur = today();
  let to = `${month}-${String(lastDay).padStart(2, "0")}`;
  if (to > cur) to = cur; // current month: only count up to today
  return { from, to };
}

export async function buildMonthStats(month: string): Promise<MonthStats> {
  const { from, to } = monthRange(month);
  const [workouts, meals] = await Promise.all([
    getWorkoutsInRange(from, to),
    getMealsInRange(from, to),
  ]);

  const groups: GroupStat[] = MUSCLE_GROUPS.map((name) => ({
    name, hart: 0, mittel: 0, leicht: 0, total: 0,
  }));
  for (const w of workouts) {
    for (const g of w.groups) {
      const stat = groups.find((s) => s.name === g.name);
      if (!stat) continue;
      stat[g.intensity as Intensity]++;
      stat.total++;
    }
  }

  // meals: average per tracked day
  const byDay = new Map<string, { kcal: number; protein: number }>();
  for (const m of meals) {
    const d = byDay.get(m.date) ?? { kcal: 0, protein: 0 };
    d.kcal += m.kcal;
    d.protein += m.protein;
    byDay.set(m.date, d);
  }
  const daysTracked = byDay.size;
  let avgKcal: number | null = null;
  let avgProtein: number | null = null;
  if (daysTracked > 0) {
    let k = 0, p = 0;
    for (const d of byDay.values()) { k += d.kcal; p += d.protein; }
    avgKcal = Math.round(k / daysTracked);
    avgProtein = Math.round(p / daysTracked);
  }

  // this week + week streak (consecutive weeks with >= 1 visit, counting back from this week)
  const allRecent = await getWorkoutsInRange(addDays(today(), -7 * 26), today());
  const weeks = new Set(allRecent.map((w) => weekStart(parseDate(w.date))));
  const thisWeek = weekStart(new Date());
  const visitsThisWeek = allRecent.filter(
    (w) => weekStart(parseDate(w.date)) === thisWeek
  ).length;
  let weekStreak = 0;
  let cursor = thisWeek;
  while (weeks.has(cursor)) {
    weekStreak++;
    cursor = addDays(cursor, -7);
  }
  // current week without a visit yet shouldn't break a running streak
  if (weekStreak === 0 && weeks.has(addDays(thisWeek, -7))) {
    cursor = addDays(thisWeek, -7);
    while (weeks.has(cursor)) {
      weekStreak++;
      cursor = addDays(cursor, -7);
    }
  }

  const daysInRange =
    (parseDate(to).getTime() - parseDate(from).getTime()) / 86400000 + 1;

  return {
    month,
    gymVisits: workouts.length,
    daysInRange: Math.max(1, Math.round(daysInRange)),
    groups,
    untrained: groups.filter((g) => g.total === 0).map((g) => g.name),
    visitsThisWeek,
    weekStreak,
    avgKcal,
    avgProtein,
    daysTracked,
  };
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Map of muscle group -> last trained date, from recent workouts. */
export async function lastTrainedMap(days = 60): Promise<Map<string, string>> {
  const from = addDays(today(), -days);
  const workouts = await getWorkoutsInRange(from, today());
  const map = new Map<string, string>();
  for (const w of workouts) {
    for (const g of w.groups) {
      const prev = map.get(g.name);
      if (!prev || w.date > prev) map.set(g.name, w.date);
    }
  }
  return map;
}

/** Groups not trained within the last `thresholdDays` days. */
export function neglectedGroups(
  lastTrained: Map<string, string>,
  thresholdDays = 7
): { name: string; last: string | null }[] {
  const cutoff = addDays(today(), -thresholdDays);
  return MUSCLE_GROUPS.filter((g) => g !== "Cardio")
    .map((name) => ({ name, last: lastTrained.get(name) ?? null }))
    .filter((g) => !g.last || g.last < cutoff);
}

export function statsForPrompt(stats: MonthStats, settings: Settings): string {
  return JSON.stringify(
    {
      monat: stats.month,
      gymBesuche: stats.gymVisits,
      zeitraumTage: stats.daysInRange,
      besucheProWoche: +(stats.gymVisits / (stats.daysInRange / 7)).toFixed(1),
      muskelgruppen: stats.groups.map((g) => ({
        name: g.name,
        gesamt: g.total,
        hart: g.hart,
        mittel: g.mittel,
        leicht: g.leicht,
      })),
      nichtTrainiert: stats.untrained,
      ernaehrung:
        stats.avgKcal !== null
          ? {
              getrackteTage: stats.daysTracked,
              schnittKcal: stats.avgKcal,
              schnittProtein: stats.avgProtein,
              zielKcal: settings.kcalGoal,
              zielProtein: settings.proteinGoal,
            }
          : null,
    },
    null,
    2
  );
}
