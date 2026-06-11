import { useEffect, useRef, useState } from "react";
import { addPhoto, deletePhoto, watchPhotos, type ProgressPhoto } from "../lib/db";
import { germanDate, today } from "../lib/dates";
import { compressForStorage } from "../lib/image";
import { Button, Card, Spinner } from "../components/ui";

export default function Photos() {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [compare, setCompare] = useState(false);
  // comparison slots: photo ids; null = default (oldest / newest)
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [picking, setPicking] = useState<"left" | "right" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => watchPhotos(setPhotos), []);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const image = await compressForStorage(file);
      await addPhoto(today(), image);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Foto konnte nicht gespeichert werden");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: ProgressPhoto) {
    setBusy(true);
    try {
      await deletePhoto(photo.id);
      setViewing(null);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const list = photos ?? [];
  // watchPhotos delivers newest first
  const newest = list[0] ?? null;
  const oldest = list[list.length - 1] ?? null;
  const left = list.find((p) => p.id === leftId) ?? oldest;
  const right = list.find((p) => p.id === rightId) ?? newest;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Progress-Fotos</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {list.length === 0 ? "Halte deinen Fortschritt fest" : `${list.length} Fotos`}
          </p>
        </div>
        {list.length >= 2 && (
          <Button variant={compare ? "primary" : "secondary"} onClick={() => setCompare(!compare)}>
            ⚖️ Vergleich
          </Button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickPhoto}
      />
      <Button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full">
        {busy ? "Speichern…" : "📷 Neues Foto"}
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {photos === null && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {photos !== null && list.length === 0 && (
        <Card className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p className="mb-1 text-3xl">📸</p>
          Noch keine Fotos. Mach dein erstes Progress-Foto —<br />
          es wird automatisch mit Datum gespeichert.
        </Card>
      )}

      {compare && left && right && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Vergleich · tippe auf ein Bild zum Wechseln
          </p>
          <div className="grid grid-cols-2 gap-2">
            {([["left", left], ["right", right]] as const).map(([side, p]) => (
              <button key={side} onClick={() => setPicking(side)} className="text-left">
                <img src={p.image} alt="Progress" className="w-full rounded-xl" />
                <p className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  {germanDate(p.date)}
                </p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => setViewing(p)}>
              <img src={p.image} alt="Progress" className="aspect-[3/4] w-full rounded-xl object-cover" />
              <p className="mt-0.5 text-center text-[10px] text-zinc-500 dark:text-zinc-400">
                {p.date.split("-").reverse().join(".")}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* photo picker for comparison */}
      {picking && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4" onClick={() => setPicking(null)}>
          <p className="mb-3 text-center text-sm font-medium text-white">Foto auswählen</p>
          <div className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto">
            {list.map((p) => (
              <button
                key={p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (picking === "left") setLeftId(p.id);
                  else setRightId(p.id);
                  setPicking(null);
                }}
              >
                <img src={p.image} alt="Progress" className="aspect-[3/4] w-full rounded-xl object-cover" />
                <p className="mt-0.5 text-center text-[10px] text-zinc-300">
                  {p.date.split("-").reverse().join(".")}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* fullscreen viewer */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 pb-safe">
          <div className="flex items-center justify-between p-4">
            <p className="font-medium text-white">{germanDate(viewing.date)}</p>
            <button
              onClick={() => {
                setViewing(null);
                setConfirmDelete(false);
              }}
              className="rounded-full bg-white/10 px-3 py-1 text-sm text-white"
            >
              Schließen
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            <img src={viewing.image} alt="Progress" className="max-h-full max-w-full rounded-xl" />
          </div>
          <div className="p-4">
            {confirmDelete ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
                  Abbrechen
                </Button>
                <Button variant="danger" onClick={() => remove(viewing)} disabled={busy} className="flex-1">
                  Ja, löschen
                </Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} className="w-full">
                🗑️ Foto löschen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
