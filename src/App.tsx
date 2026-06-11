import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { watchAuth, logout } from "./lib/firebase";
import {
  getSettings,
  createMyProfile,
  watchMyProfile,
  DEFAULT_SETTINGS,
  type Settings,
  type UserProfile,
} from "./lib/db";
import Login from "./pages/Login";
import Today from "./pages/Today";
import Food from "./pages/Food";
import CalendarPage from "./pages/Calendar";
import Machines from "./pages/Machines";
import Photos from "./pages/Photos";
import Stats from "./pages/Stats";
import SettingsSheet from "./components/SettingsSheet";
import { Button, Spinner } from "./components/ui";

type Tab = "today" | "food" | "calendar" | "machines" | "photos" | "stats";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "today", icon: "🏠", label: "Heute" },
  { id: "food", icon: "🍽️", label: "Essen" },
  { id: "calendar", icon: "📅", label: "Kalender" },
  { id: "machines", icon: "🏋️", label: "Geräte" },
  { id: "photos", icon: "📸", label: "Fotos" },
  { id: "stats", icon: "📊", label: "Statistik" },
];

function WaitScreen({ blocked }: { blocked: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="text-6xl">{blocked ? "🚫" : "⏳"}</div>
      <h1 className="text-xl font-bold">
        {blocked ? "Konto gesperrt" : "Fast geschafft!"}
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {blocked
          ? "Dein Konto wurde gesperrt. Wende dich an Eduart."
          : "Dein Konto ist erstellt — Eduart muss dich nur noch freischalten. Schau später nochmal rein."}
      </p>
      <Button variant="secondary" onClick={() => logout()}>
        Abmelden
      </Button>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const creatingProfile = useRef(false);

  useEffect(
    () =>
      watchAuth((u) => {
        setUser(u);
        setAuthReady(true);
        if (!u) {
          setProfile(null);
          setProfileReady(false);
        }
      }),
    []
  );

  useEffect(() => {
    if (!user) return;
    return watchMyProfile((p) => {
      setProfile(p);
      setProfileReady(true);
      // Erster Google-Login (oder Profil fehlt): Profil automatisch anlegen
      if (!p && !creatingProfile.current) {
        creatingProfile.current = true;
        const isGoogle = user.providerData[0]?.providerId === "google.com";
        const name =
          user.displayName?.trim() || user.email?.split("@")[0] || "unbekannt";
        createMyProfile(name, isGoogle ? "google" : "password")
          .catch(() => {})
          .finally(() => {
            creatingProfile.current = false;
          });
      }
    });
  }, [user]);

  const active = profile?.status === "active";

  useEffect(() => {
    if (user && active) getSettings().then(setSettings).catch(() => {});
  }, [user, active]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", settings.theme === "dark" ? "#09090b" : "#f4f4f5");
  }, [settings.theme]);

  if (!authReady || (user && !profileReady)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Login />;

  if (!profile || profile.status !== "active") {
    return <WaitScreen blocked={profile?.status === "blocked"} />;
  }

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      <header className="flex items-center justify-between px-4 pb-1 pt-safe">
        <span className="pt-2 text-sm font-bold text-emerald-500">🏋️ Gym Tracker</span>
        <button
          onClick={() => setSettingsOpen(true)}
          className="pt-2 text-xl"
          aria-label="Einstellungen"
        >
          ⚙️
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === "today" && <Today settings={settings} goFood={() => setTab("food")} />}
        {tab === "food" && <Food />}
        {tab === "calendar" && <CalendarPage />}
        {tab === "machines" && <Machines />}
        {tab === "photos" && <Photos />}
        {tab === "stats" && <Stats settings={settings} />}
      </main>

      <nav className="grid grid-cols-6 border-t border-zinc-200 bg-white pb-safe dark:border-zinc-800 dark:bg-zinc-900">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              tab === t.id ? "text-emerald-500" : "text-zinc-400"
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        profile={profile}
      />
    </div>
  );
}
