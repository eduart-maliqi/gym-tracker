import { useEffect, useState } from "react";
import {
  addMeal,
  deleteMeal,
  updateMeal,
  watchMeals,
  watchCreatine,
  setCreatineTaken,
  getCreatineInRange,
  type Meal,
  type Settings,
} from "../lib/db";
import { addDays, germanDate, today } from "../lib/dates";
import { Button, Card, Input, ProgressBar, Sheet } from "../components/ui";

const SOURCE_ICON: Record<Meal["source"], string> = {
  manual: "✏️",
  photo: "📷",
  chat: "💬",
};

export default function Today({
  settings,
  goFood,
}: {
  settings: Settings;
  goFood: () => void;
}) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatineTaken, setCreatineTakenState] = useState(false);
  const [creatineDays, setCreatineDays] = useState<Set<string> | null>(null);

  const date = today();

  useEffect(() => watchMeals(date, setMeals), [date]);

  useEffect(() => watchCreatine(date, setCreatineTakenState), [date]);

  useEffect(() => {
    getCreatineInRange(addDays(date, -90), date)
      .then((days) => setCreatineDays(new Set(days)))
      .catch(() => {});
  }, [date, creatineTaken]);

  // consecutive days incl. today (or ending yesterday if today not yet taken)
  let streak = 0;
  if (creatineDays) {
    let d = creatineDays.has(date) ? date : addDays(date, -1);
    while (creatineDays.has(d)) {
      streak++;
      d = addDays(d, -1);
    }
  }

  async function toggleCreatine() {
    setCreatineTakenState(!creatineTaken); // optimistic, watcher corrects if needed
    try {
      await setCreatineTaken(date, !creatineTaken);
    } catch {
      setCreatineTakenState(creatineTaken);
    }
  }

  const totalKcal = meals.reduce((s, m) => s + m.kcal, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);

  function openForm(meal?: Meal) {
    setEditing(meal ?? null);
    setName(meal?.name ?? "");
    setKcal(meal ? String(meal.kcal) : "");
    setProtein(meal ? String(meal.protein) : "");
    setFormOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      const data = {
        name: name.trim() || "Mahlzeit",
        kcal: Math.max(0, Math.round(Number(kcal) || 0)),
        protein: Math.max(0, Math.round(Number(protein) || 0)),
      };
      if (editing) {
        await updateMeal(editing.id, data);
      } else {
        await addMeal({ ...data, date, source: "manual" });
      }
      setFormOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Heute</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{germanDate(date)}</p>
      </div>

      <Card className="space-y-4">
        <ProgressBar
          value={totalKcal}
          max={settings.kcalGoal}
          label="Kalorien"
          unit="kcal"
          color="bg-emerald-500"
        />
        <ProgressBar
          value={totalProtein}
          max={settings.proteinGoal}
          label="Protein"
          unit="g"
          color="bg-sky-500"
        />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => openForm()} variant="secondary">
          ✏️ Manuell eintragen
        </Button>
        <Button onClick={goFood}>📷 Foto / Chat</Button>
      </div>

      <Card className="flex items-center gap-3">
        <span className="text-2xl">💊</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Kreatin</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {creatineTaken
              ? streak > 1
                ? `Genommen ✅ · ${streak} Tage in Folge 🔥`
                : "Genommen ✅"
              : streak > 0
                ? `Noch nicht genommen · Serie: ${streak} Tage`
                : "Heute noch nicht genommen"}
          </p>
        </div>
        <Button
          variant={creatineTaken ? "secondary" : "primary"}
          onClick={toggleCreatine}
        >
          {creatineTaken ? "Rückgängig" : "Genommen ✓"}
        </Button>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          Mahlzeiten ({meals.length})
        </h2>
        {meals.length === 0 && (
          <Card className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Noch nichts gegessen eingetragen. 🍽️
          </Card>
        )}
        {meals.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-zinc-900"
          >
            <span className="text-xl">{SOURCE_ICON[m.source]}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => openForm(m)}>
              <p className="truncate font-medium">{m.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {m.kcal} kcal · {m.protein} g Protein
              </p>
            </button>
            <button
              onClick={() => deleteMeal(m.id)}
              className="px-2 text-lg text-zinc-400 active:text-red-500"
              aria-label="Löschen"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Mahlzeit bearbeiten" : "Mahlzeit eintragen"}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Was hast du gegessen?</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Hähnchen mit Reis"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Kalorien (kcal)</label>
              <Input
                type="number"
                inputMode="numeric"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                placeholder="650"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Protein (g)</label>
              <Input
                type="number"
                inputMode="numeric"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="45"
              />
            </div>
          </div>
          <Button onClick={save} disabled={busy} className="w-full">
            {busy ? "Speichern…" : "Speichern"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
