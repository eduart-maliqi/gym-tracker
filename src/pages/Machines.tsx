import { useEffect, useState } from "react";
import {
  addMachine,
  deleteMachine,
  updateMachine,
  watchMachines,
  type Machine,
} from "../lib/db";
import { germanDate, today } from "../lib/dates";
import { Button, Card, Input, Sheet } from "../components/ui";

function current(m: Machine) {
  return m.history[m.history.length - 1];
}

function delta(m: Machine): number | null {
  if (m.history.length < 2) return null;
  return current(m).kg - m.history[m.history.length - 2].kg;
}

export default function Machines() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Machine | null>(null);
  const [name, setName] = useState("");
  const [kg, setKg] = useState("");
  const [newKg, setNewKg] = useState("");
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => watchMachines(setMachines), []);

  // keep the open sheet in sync with live data
  useEffect(() => {
    if (selected) {
      const fresh = machines.find((m) => m.id === selected.id);
      if (fresh) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines]);

  async function add() {
    const weight = Number(kg.replace(",", "."));
    if (!name.trim() || !(weight > 0)) return;
    setBusy(true);
    try {
      await addMachine(name.trim(), weight, today());
      setAddOpen(false);
      setName("");
      setKg("");
    } finally {
      setBusy(false);
    }
  }

  function openMachine(m: Machine) {
    setSelected(m);
    setNewKg("");
    setEditName(m.name);
  }

  async function saveWeight() {
    if (!selected) return;
    const weight = Number(newKg.replace(",", "."));
    if (!(weight > 0)) return;
    setBusy(true);
    try {
      const d = today();
      // same day: replace today's entry instead of stacking duplicates
      const history = selected.history.filter((h) => h.date !== d);
      history.push({ date: d, kg: weight });
      await updateMachine(selected.id, { history });
      setNewKg("");
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (!selected || !editName.trim() || editName.trim() === selected.name) return;
    await updateMachine(selected.id, { name: editName.trim() });
  }

  async function remove() {
    if (!selected) return;
    setBusy(true);
    try {
      await deleteMachine(selected.id);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Geräte &amp; Gewichte</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Wie viel schaffst du wo?
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Gerät</Button>
      </div>

      {machines.length === 0 && (
        <Card className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p className="mb-1 text-3xl">🏋️</p>
          Noch keine Geräte. Füge z.B. „Brustpresse" oder
          <br />
          „Lat-Zug" hinzu und trage ein, wie viel Kilo du schaffst.
        </Card>
      )}

      <div className="space-y-2">
        {machines.map((m) => {
          const d = delta(m);
          return (
            <button
              key={m.id}
              onClick={() => openMachine(m)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-sm dark:bg-zinc-900"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  zuletzt {germanDate(current(m).date)}
                </p>
              </div>
              {d !== null && d !== 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    d > 0
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/15 text-red-500"
                  }`}
                >
                  {d > 0 ? "▲" : "▼"} {Math.abs(d)} kg
                </span>
              )}
              <span className="text-lg font-bold text-emerald-500">
                {current(m).kg} kg
              </span>
            </button>
          );
        })}
      </div>

      {/* add machine */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Gerät hinzufügen">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Gerät / Übung</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Brustpresse"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Aktuelles Gewicht (kg)</label>
            <Input
              type="number"
              inputMode="decimal"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              placeholder="40"
            />
          </div>
          <Button onClick={add} disabled={busy || !name.trim() || !kg} className="w-full">
            Speichern
          </Button>
        </div>
      </Sheet>

      {/* machine detail */}
      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
      >
        {selected && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-4xl font-bold text-emerald-500">{current(selected).kg} kg</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Stand {germanDate(current(selected).date)}
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={newKg}
                onChange={(e) => setNewKg(e.target.value)}
                placeholder="Neues Gewicht (kg)"
              />
              <Button onClick={saveWeight} disabled={busy || !newKg}>
                Eintragen
              </Button>
            </div>

            {selected.history.length > 1 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  Verlauf
                </h3>
                <div className="space-y-1.5">
                  {[...selected.history]
                    .reverse()
                    .slice(0, 10)
                    .map((h, i, arr) => {
                      const prev = arr[i + 1];
                      const diff = prev ? h.kg - prev.kg : null;
                      return (
                        <div
                          key={h.date}
                          className="flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800"
                        >
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {germanDate(h.date)}
                          </span>
                          <span className="flex items-center gap-2">
                            {diff !== null && diff !== 0 && (
                              <span
                                className={`text-xs font-semibold ${
                                  diff > 0 ? "text-emerald-500" : "text-red-500"
                                }`}
                              >
                                {diff > 0 ? "+" : ""}
                                {diff} kg
                              </span>
                            )}
                            <span className="font-semibold">{h.kg} kg</span>
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                Umbenennen
              </h3>
              <div className="flex gap-2">
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                <Button
                  variant="secondary"
                  onClick={saveName}
                  disabled={!editName.trim() || editName.trim() === selected.name}
                >
                  OK
                </Button>
              </div>
            </div>

            <Button variant="danger" onClick={remove} disabled={busy} className="w-full">
              Gerät löschen
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
