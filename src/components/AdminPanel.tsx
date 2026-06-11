import { useEffect, useState } from "react";
import {
  watchAllUsers,
  updateUser,
  getUserAiUsageToday,
  type UserProfile,
} from "../lib/db";
import { today } from "../lib/dates";
import { Button } from "./ui";

const STATUS_CHIP: Record<UserProfile["status"], { label: string; cls: string }> = {
  pending: { label: "wartet", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  active: { label: "aktiv", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  blocked: { label: "gesperrt", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

export default function AdminPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [limits, setLimits] = useState<Record<string, string>>({});

  useEffect(() => watchAllUsers(setUsers), []);

  useEffect(() => {
    const date = today();
    users
      .filter((u) => u.role !== "admin" && u.aiEnabled)
      .forEach((u) => {
        getUserAiUsageToday(u.id, date)
          .then((n) => setUsage((prev) => ({ ...prev, [u.id]: n })))
          .catch(() => {});
      });
  }, [users]);

  const members = users.filter((u) => u.role !== "admin");

  if (members.length === 0) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Noch keine Kollegen registriert. Schick ihnen einfach den Link:
        <br />
        <span className="font-mono">gym-tracker-eduart.web.app</span>
      </p>
    );
  }

  async function setLimit(u: UserProfile) {
    const raw = limits[u.id];
    const n = Math.max(0, Math.round(Number(raw)));
    if (!raw || Number.isNaN(n)) return;
    await updateUser(u.id, { aiDailyLimit: n });
    setLimits((prev) => ({ ...prev, [u.id]: "" }));
  }

  return (
    <div className="space-y-3">
      {members.map((u) => {
        const chip = STATUS_CHIP[u.status];
        return (
          <div key={u.id} className="space-y-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.provider === "google" ? "🔵" : "👤"} {u.name}
                </p>
                {u.aiEnabled && u.status === "active" && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    KI heute: {usage[u.id] ?? 0}/{u.aiDailyLimit}
                  </p>
                )}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chip.cls}`}>
                {chip.label}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {u.status !== "active" ? (
                <Button onClick={() => updateUser(u.id, { status: "active" })}>
                  ✅ Freischalten
                </Button>
              ) : (
                <Button variant="danger" onClick={() => updateUser(u.id, { status: "blocked" })}>
                  Sperren
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => updateUser(u.id, { aiEnabled: !u.aiEnabled })}
              >
                {u.aiEnabled ? "🤖 KI aus" : "🤖 KI an"}
              </Button>
            </div>

            {u.aiEnabled && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={String(u.aiDailyLimit)}
                  value={limits[u.id] ?? ""}
                  onChange={(e) => setLimits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-600 dark:bg-zinc-700"
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Anfragen/Tag</span>
                <Button variant="ghost" onClick={() => setLimit(u)} disabled={!limits[u.id]}>
                  Setzen
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
