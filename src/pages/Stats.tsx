import { useEffect, useState } from "react";
import { getRecap, saveRecap, type Recap, type Settings } from "../lib/db";
import { monthKey, monthLabel, prevMonthKey } from "../lib/dates";
import { generateRecap } from "../lib/openai";
import { buildMonthStats, statsForPrompt, type MonthStats } from "../lib/stats";
import { Button, Card, Spinner } from "../components/ui";

export default function Stats({ settings }: { settings: Settings }) {
  const curMonth = monthKey(new Date());
  const lastMonth = prevMonthKey(new Date());

  const [stats, setStats] = useState<MonthStats | null>(null);
  const [finalRecap, setFinalRecap] = useState<Recap | null>(null);
  const [interimRecap, setInterimRecap] = useState<Recap | null>(null);
  const [generating, setGenerating] = useState<"final" | "interim" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    buildMonthStats(curMonth).then(setStats).catch(() => {});
    getRecap(curMonth, "interim").then(setInterimRecap);
    // auto-generate last month's recap once there is data for it
    (async () => {
      const existing = await getRecap(lastMonth, "final");
      if (existing) {
        setFinalRecap(existing);
        return;
      }
      try {
        const lastStats = await buildMonthStats(lastMonth);
        if (lastStats.gymVisits === 0 && lastStats.daysTracked === 0) return;
        setGenerating("final");
        const text = await generateRecap(statsForPrompt(lastStats, settings), false);
        const recap: Recap = { month: lastMonth, type: "final", text };
        await saveRecap(recap);
        setFinalRecap(recap);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Recap-Fehler");
      } finally {
        setGenerating(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function makeInterim() {
    setError("");
    setGenerating("interim");
    try {
      const s = stats ?? (await buildMonthStats(curMonth));
      const text = await generateRecap(statsForPrompt(s, settings), true);
      const recap: Recap = { month: curMonth, type: "interim", text };
      await saveRecap(recap);
      setInterimRecap(recap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recap-Fehler");
    } finally {
      setGenerating(null);
    }
  }

  const maxTotal = stats ? Math.max(1, ...stats.groups.map((g) => g.total)) : 1;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Statistik &amp; Recap</h1>

      {/* Streak / quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-2xl font-bold text-emerald-500">{stats?.visitsThisWeek ?? "–"}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">diese Woche</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-emerald-500">{stats?.gymVisits ?? "–"}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">diesen Monat</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-emerald-500">
            {stats ? `${stats.weekStreak}🔥` : "–"}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Wochen-Streak</p>
        </Card>
      </div>

      {/* per-group bars */}
      <Card>
        <h2 className="mb-3 font-semibold">Muskelgruppen — {monthLabel(curMonth)}</h2>
        {!stats && <Spinner className="mx-auto" />}
        {stats && (
          <div className="space-y-2.5">
            {stats.groups.map((g) => (
              <div key={g.name}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className={g.total === 0 ? "text-zinc-400" : "font-medium"}>
                    {g.name}
                  </span>
                  <span className="text-zinc-400">{g.total}×</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  {g.hart > 0 && (
                    <div className="bg-red-500" style={{ width: `${(g.hart / maxTotal) * 100}%` }} />
                  )}
                  {g.mittel > 0 && (
                    <div className="bg-amber-500" style={{ width: `${(g.mittel / maxTotal) * 100}%` }} />
                  )}
                  {g.leicht > 0 && (
                    <div className="bg-sky-500" style={{ width: `${(g.leicht / maxTotal) * 100}%` }} />
                  )}
                </div>
              </div>
            ))}
            <div className="flex gap-3 pt-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />hart</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />mittel</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />leicht</span>
            </div>
          </div>
        )}
      </Card>

      {/* nutrition averages */}
      {stats && stats.avgKcal !== null && (
        <Card>
          <h2 className="mb-1 font-semibold">Ernährung — Ø pro getracktem Tag</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {stats.avgKcal} kcal (Ziel {settings.kcalGoal}) · {stats.avgProtein} g Protein (Ziel{" "}
            {settings.proteinGoal} g) · {stats.daysTracked} Tage getrackt
          </p>
        </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* last month final recap */}
      <Card>
        <h2 className="mb-2 font-semibold">📋 Recap {monthLabel(lastMonth)}</h2>
        {generating === "final" && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Spinner /> Recap wird erstellt…
          </div>
        )}
        {finalRecap && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{finalRecap.text}</p>
        )}
        {!finalRecap && generating !== "final" && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Noch keine Daten aus dem Vormonat — das Recap erscheint hier automatisch am
            Monatsanfang.
          </p>
        )}
      </Card>

      {/* interim recap */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">⏱️ Zwischenbilanz {monthLabel(curMonth)}</h2>
        </div>
        {interimRecap && generating !== "interim" && (
          <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed">{interimRecap.text}</p>
        )}
        {generating === "interim" ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Spinner /> Wird erstellt…
          </div>
        ) : (
          <Button variant="secondary" onClick={makeInterim} className="w-full">
            {interimRecap ? "Zwischenbilanz aktualisieren" : "Zwischenbilanz erstellen"}
          </Button>
        )}
      </Card>
    </div>
  );
}
