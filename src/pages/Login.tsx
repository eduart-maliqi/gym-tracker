import { useState } from "react";
import { login, loginWithGoogle, register, validUsername } from "../lib/firebase";
import { createMyProfile } from "../lib/db";
import { Button, Input } from "../components/ui";

type Mode = "login" | "register";

function authError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password"))
    return "Benutzername oder Passwort falsch";
  if (code.includes("user-not-found")) return "Konto nicht gefunden — erst registrieren?";
  if (code.includes("email-already-in-use")) return "Dieser Benutzername ist schon vergeben";
  if (code.includes("weak-password")) return "Passwort zu kurz (mind. 6 Zeichen)";
  if (code.includes("popup-closed-by-user")) return "Google-Anmeldung abgebrochen";
  if (code.includes("too-many-requests")) return "Zu viele Versuche — warte kurz";
  return "Das hat nicht geklappt — versuch es nochmal";
}

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        const username = name.trim().toLowerCase();
        if (!validUsername(username)) {
          setError("Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen, - und _");
          return;
        }
        const user = await register(username, password);
        await createMyProfile(username, "password");
        void user;
      } else {
        await login(name, password);
        // Profil wird in App.tsx geprüft/angelegt
      }
    } catch (e) {
      setError(authError(e));
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setBusy(true);
    setError("");
    try {
      await loginWithGoogle();
      // Profil wird in App.tsx geprüft/angelegt
    } catch (e) {
      setError(authError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mb-3 text-6xl">🏋️</div>
        <h1 className="text-2xl font-bold">Gym Tracker</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {mode === "login" ? "Melde dich an, um loszulegen" : "Erstelle dein Konto"}
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={`rounded-lg py-2 text-sm font-semibold ${
                mode === m
                  ? "bg-white shadow-sm dark:bg-zinc-700"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {m === "login" ? "Anmelden" : "Registrieren"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Input
            placeholder={mode === "register" ? "Benutzername (z.B. max)" : "Benutzername"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
          />
          <Input
            type="password"
            placeholder={mode === "register" ? "Passwort (mind. 6 Zeichen)" : "Passwort"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={busy || !name.trim() || !password} className="w-full">
            {busy ? "Einen Moment…" : mode === "login" ? "Anmelden" : "Konto erstellen"}
          </Button>
        </form>

        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
          <span className="text-xs text-zinc-400">oder</span>
          <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
        </div>

        <Button variant="secondary" onClick={googleLogin} disabled={busy} className="w-full">
          <span className="mr-2">🔵</span> Mit Google anmelden
        </Button>

        {mode === "register" && (
          <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
            Nach der Registrierung muss Eduart dein Konto freischalten.
          </p>
        )}
      </div>
    </div>
  );
}
