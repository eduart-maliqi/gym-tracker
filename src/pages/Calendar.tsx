import { useCallback, useEffect, useState } from "react";
import {
  MUSCLE_GROUPS,
  deleteWorkout,
  getCreatineInRange,
  getWorkout,
  getWorkoutsInRange,
  saveWorkout,
  type Intensity,
  type Workout,
  type WorkoutGroup,
} from "../lib/db";
import { WEEKDAYS, MONTHS, germanDate, monthGrid, today, fmtDate } from "../lib/dates";
import { lastTrainedMap, neglectedGroups } from "../lib/stats";
import { Button, Card, Sheet } from "../components/ui";

const INTENSITIES: Intensity[] = ["leicht", "mittel", "hart"];
const INTENSITY_STYLE: Record<Intensity, string> = {
  leicht: "bg-sky-500 text-white",
  mittel: "bg-amber-500 text-white",
  hart: "bg-red-500 text-white",
};

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [workouts, setWorkouts] = useState<Map<string, Workout>>(new Map());
  const [creatineDays, setCreatineDays] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [groups, setGroups] = useState<WorkoutGroup[]>([]);
  const [note, setNote] = useState("");
  const [existing, setExisting] = useState(false);
  const [neglected, setNeglected] = useState<{ name: string; last: string | null }[]>([]);
  const [busy, setBusy] = useState(false);

  const loadMonth = useCallback(async () => {
    const from = fmtDate(new Date(year, month, 1));
    const to = fmtDate(new Date(year, month + 1, 0));
    const [list, creatine] = await Promise.all([
      getWorkoutsInRange(from, to),
      getCreatineInRange(from, to).catch(() => [] as string[]),
    ]);
    setWorkouts(new Map(list.map((w) => [w.date, w])));
    setCreatineDays(new Set(creatine));
  }, [year, month]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  async function openDay(date: string) {
    setSelected(date);
    const w = workouts.get(date) ?? (await getWorkout(date));
    setGroups(w?.groups ?? []);
    setNote(w?.note ?? "");
    setExisting(!!w);
    lastTrainedMap().then((m) => setNeglected(neglectedGroups(m)));
  }

  function toggleGroup(name: string) {
    setGroups((g) =>
      g.some((x) => x.name === name)
        ? g.filter((x) => x.name !== name)
        : [...g, { name, intensity: "mittel" }]
    );
  }

  function setIntensity(name: string, intensity: Intensity) {
    setGroups((g) => g.map((x) => (x.name === name ? { ...x, intensity } : x)));
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      if (groups.length === 0) {
        if (existing) await deleteWorkout(selected);
      } else {
        // keep selection order stable: sort by muscle group list order
        const sorted = [...groups].sort(
          (a, b) =>
            MUSCLE_GROUPS.indexOf(a.name as (typeof MUSCLE_GROUPS)[number]) -
            MUSCLE_GROUPS.indexOf(b.name as (typeof MUSCLE_GROUPS)[number])
        );
        await saveWorkout({ date: selected, groups: sorted, note: note.trim() });
      }
      await loadMonth();
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setBusy(true);
    try {
      await deleteWorkout(selected);
      await loadMonth();
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  const cells = monthGrid(year, month);
  const cur = today();
  const forgotten = neglected.filter((n) => !groups.some((g) => g.name === n.name));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Trainings-Kalender</h1>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button
            className="rounded-lg px-3 py-1 text-xl active:bg-zinc-200 dark:active:bg-zinc-800"
            onClick={() => {
              const d = new Date(year, month - 1, 1);
              setYear(d.getFullYear());
              setMonth(d.getMonth());
            }}
          >
            ‹
          </button>
          <span className="font-semibold">
            {MONTHS[month]} {year}
          </span>
          <button
            className="rounded-lg px-3 py-1 text-xl active:bg-zinc-200 dark:active:bg-zinc-800"
            onClick={() => {
              const d = new Date(year, month + 1, 1);
              setYear(d.getFullYear());
              setMonth(d.getMonth());
            }}
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-xs font-medium text-zinc-400">
              {w}
            </div>
          ))}
          {cells.map((date, i) =>
            date === null ? (
              <div key={`x${i}`} />
            ) : (
              <button
                key={date}
                onClick={() => openDay(date)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm ${
                  date === cur
                    ? "border-2 border-emerald-500 font-bold"
                    : "active:bg-zinc-100 dark:active:bg-zinc-800"
                } ${workouts.has(date) ? "bg-emerald-500/15" : ""}`}
              >
                {Number(date.slice(8))}
                {creatineDays.has(date) && (
                  <span className="absolute right-0.5 top-0.5 text-[8px]">💊</span>
                )}
                {workouts.has(date) && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {workouts
                      .get(date)!
                      .groups.slice(0, 3)
                      .map((g, j) => (
                        <span
                          key={j}
                          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        />
                      ))}
                  </span>
                )}
              </button>
            )
          )}
        </div>
        <p className="mt-3 text-center text-xs text-zinc-400">
          Tippe auf einen Tag, um dein Training einzutragen
        </p>
      </Card>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? germanDate(selected) : ""}
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Was hast du trainiert?</p>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_GROUPS.map((name) => {
                const sel = groups.find((g) => g.name === name);
                return (
                  <button
                    key={name}
                    onClick={() => toggleGroup(name)}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                      sel
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          {groups.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Wie intensiv?</p>
              {groups.map((g) => (
                <div
                  key={g.name}
                  className="flex items-center justify-between gap-2 rounded-xl bg-zinc-100 p-2 pl-3 dark:bg-zinc-800"
                >
                  <span className="text-sm font-medium">{g.name}</span>
                  <div className="flex gap-1">
                    {INTENSITIES.map((i) => (
                      <button
                        key={i}
                        onClick={() => setIntensity(g.name, i)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize ${
                          g.intensity === i
                            ? INTENSITY_STYLE[i]
                            : "bg-white text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {forgotten.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                🔔 Nicht vergessen!
              </p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                Über 7 Tage nicht trainiert:{" "}
                {forgotten.map((f) => f.name).join(", ")}
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Notiz (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="z.B. neuer Rekord beim Bankdrücken 💪"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          <div className="flex gap-2">
            {existing && (
              <Button variant="danger" onClick={remove} disabled={busy}>
                Löschen
              </Button>
            )}
            <Button onClick={save} disabled={busy} className="flex-1">
              {busy ? "Speichern…" : "Speichern"}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
