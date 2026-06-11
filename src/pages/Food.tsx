import { useEffect, useRef, useState } from "react";
import { addMeal } from "../lib/db";
import { today } from "../lib/dates";
import {
  compressImage,
  foodChat,
  type ChatMessage,
  type FoodEstimate,
} from "../lib/openai";
import { Button, Card, Spinner } from "../components/ui";

interface DisplayMsg {
  role: "user" | "assistant";
  text: string;
  image?: string;
}

export default function Food() {
  const [apiHistory, setApiHistory] = useState<ChatMessage[]>([]);
  const [messages, setMessages] = useState<DisplayMsg[]>([]);
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [hadPhoto, setHadPhoto] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, estimate]);

  async function send(text: string, imageDataUrl?: string) {
    setError("");
    setSaved(false);
    const userMsg: ChatMessage = imageDataUrl
      ? {
          role: "user",
          content: [
            ...(text ? [{ type: "text" as const, text }] : []),
            { type: "image_url" as const, image_url: { url: imageDataUrl } },
          ],
        }
      : { role: "user", content: text };

    const newHistory = [...apiHistory, userMsg];
    setApiHistory(newHistory);
    setMessages((m) => [...m, { role: "user", text, image: imageDataUrl }]);
    setBusy(true);
    try {
      const res = await foodChat(newHistory);
      setApiHistory([...newHistory, { role: "assistant", content: JSON.stringify(res) }]);
      setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      if (res.estimate) setEstimate(res.estimate);
      if (imageDataUrl) setHadPhoto(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      await send(input.trim() || "Was ist das und wie viele Kalorien/Protein hat es?", dataUrl);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bild-Fehler");
    }
  }

  function onSendText() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    send(text);
  }

  async function applyEstimate() {
    if (!estimate) return;
    setBusy(true);
    try {
      await addMeal({
        date: today(),
        name: estimate.name,
        kcal: estimate.kcal,
        protein: estimate.protein,
        source: hadPhoto ? "photo" : "chat",
      });
      setSaved(true);
      setEstimate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setApiHistory([]);
    setMessages([]);
    setEstimate(null);
    setHadPhoto(false);
    setSaved(false);
    setError("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 pb-2">
        <div>
          <h1 className="text-xl font-bold">Essen erfassen</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Foto schicken oder einfach beschreiben
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" onClick={reset}>
            Neu
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {messages.length === 0 && (
          <Card className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            <p className="mb-1 text-3xl">🍕</p>
            Schick ein Foto von deinem Essen oder schreib z.B.
            <br />
            <span className="italic">„Döner mit allem"</span> — ich schätze Kalorien &amp; Protein.
            <br />
            Du kannst danach korrigieren: <span className="italic">„hab nur die Hälfte gegessen"</span>
          </Card>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "rounded-br-md bg-emerald-600 text-white"
                  : "rounded-bl-md bg-white shadow-sm dark:bg-zinc-900"
              }`}
            >
              {m.image && (
                <img src={m.image} alt="Essen" className="mb-2 max-h-48 rounded-xl" />
              )}
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm dark:bg-zinc-900">
              <Spinner />
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {saved && (
          <Card className="border border-emerald-500/40 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
            ✅ Mahlzeit gespeichert! Du findest sie unter „Heute".
          </Card>
        )}
        {estimate && !busy && (
          <Card className="border border-emerald-500/40">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              Schätzung
            </p>
            <p className="font-semibold">{estimate.name}</p>
            <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
              {estimate.kcal} kcal · {estimate.protein} g Protein
            </p>
            <div className="flex gap-2">
              <Button onClick={applyEstimate} className="flex-1">
                ✅ Übernehmen
              </Button>
            </div>
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Stimmt was nicht? Schreib es einfach unten in den Chat.
            </p>
          </Card>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-zinc-200 p-3 pb-safe dark:border-zinc-800">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickPhoto}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-xl bg-zinc-200 p-2.5 text-xl disabled:opacity-50 dark:bg-zinc-800"
          aria-label="Foto"
        >
          📷
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSendText()}
          placeholder="Nachricht…"
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <Button onClick={onSendText} disabled={busy || !input.trim()}>
          ➤
        </Button>
      </div>
    </div>
  );
}
