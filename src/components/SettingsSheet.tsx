import { useEffect, useState } from "react";
import { changePassword, logout } from "../lib/firebase";
import { saveSettings, type Settings, type UserProfile } from "../lib/db";
import { enablePush, disablePush, getPushEnabled, needsHomeScreenInstall } from "../lib/push";
import { Button, Input, Sheet } from "./ui";
import AdminPanel from "./AdminPanel";

export default function SettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  profile: UserProfile;
}) {
  const [kcal, setKcal] = useState(String(settings.kcalGoal));
  const [protein, setProtein] = useState(String(settings.proteinGoal));
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");

  useEffect(() => {
    if (open) {
      setKcal(String(settings.kcalGoal));
      setProtein(String(settings.proteinGoal));
      setMsg("");
      setErr("");
      setPushMsg("");
      getPushEnabled().then(setPushOn).catch(() => {});
    }
  }, [open, settings]);

  async function togglePush() {
    setPushBusy(true);
    setPushMsg("");
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        setPushMsg("Erinnerung ausgeschaltet.");
      } else {
        await enablePush();
        setPushOn(true);
        setPushMsg("Erinnerung aktiv ✅ — du bekommst um 18 und 21 Uhr eine Nachricht.");
      }
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : "Das hat leider nicht geklappt.");
    } finally {
      setPushBusy(false);
    }
  }

  async function saveGoals() {
    setBusy(true);
    setErr("");
    try {
      const next: Settings = {
        ...settings,
        kcalGoal: Math.max(1, Math.round(Number(kcal) || settings.kcalGoal)),
        proteinGoal: Math.max(1, Math.round(Number(protein) || settings.proteinGoal)),
      };
      await saveSettings(next);
      onChange(next);
      setMsg("Ziele gespeichert ✅");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTheme() {
    const next: Settings = { ...settings, theme: settings.theme === "dark" ? "light" : "dark" };
    onChange(next);
    try {
      await saveSettings(next);
    } catch {
      /* theme still applied locally */
    }
  }

  async function doChangePassword() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await changePassword(curPw, newPw);
      setCurPw("");
      setNewPw("");
      setMsg("Passwort geändert ✅");
    } catch {
      setErr("Passwort ändern fehlgeschlagen — aktuelles Passwort korrekt? (mind. 6 Zeichen für das neue)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Einstellungen">
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Tagesziele</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm">Kalorien (kcal)</label>
              <Input type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Protein (g)</label>
              <Input type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
          </div>
          <Button onClick={saveGoals} disabled={busy} className="w-full">
            Ziele speichern
          </Button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            💊 Kreatin-Erinnerung
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Push-Nachricht aufs Handy um 18 und 21 Uhr — nur wenn du noch nicht abgehakt hast.
            {needsHomeScreenInstall() &&
              " Wichtig: Füge die App zuerst über Safari → Teilen → „Zum Home-Bildschirm“ hinzu."}
          </p>
          <Button
            variant={pushOn ? "secondary" : "primary"}
            onClick={togglePush}
            disabled={pushBusy}
            className="w-full"
          >
            {pushBusy ? "Einen Moment…" : pushOn ? "🔕 Erinnerung ausschalten" : "🔔 Erinnerung aktivieren"}
          </Button>
          {pushMsg && <p className="text-xs text-zinc-600 dark:text-zinc-300">{pushMsg}</p>}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Design</h3>
          <Button variant="secondary" onClick={toggleTheme} className="w-full">
            {settings.theme === "dark" ? "☀️ Helles Design" : "🌙 Dunkles Design"}
          </Button>
        </section>

        {profile.role === "admin" && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
              👑 Admin — Nutzer verwalten
            </h3>
            <AdminPanel />
          </section>
        )}

        {profile.provider === "password" && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Passwort ändern</h3>
          <Input
            type="password"
            placeholder="Aktuelles Passwort"
            value={curPw}
            onChange={(e) => setCurPw(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Neues Passwort (mind. 6 Zeichen)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <Button
            variant="secondary"
            onClick={doChangePassword}
            disabled={busy || !curPw || newPw.length < 6}
            className="w-full"
          >
            Passwort ändern
          </Button>
        </section>
        )}

        {msg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}
        {err && <p className="text-sm text-red-500">{err}</p>}

        <Button variant="danger" onClick={() => logout()} className="w-full">
          Abmelden
        </Button>
      </div>
    </Sheet>
  );
}
