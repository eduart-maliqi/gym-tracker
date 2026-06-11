# 🏋️ Gym Tracker

Eine kostenlose Fitness-PWA für mich und meine Gym-Kollegen — Kalorien tracken, Trainings planen, Fortschritt sehen.

**Live:** https://gym-tracker-eduart.web.app

## Features

- **🏠 Heute** — Kalorien- und Protein-Ziele mit Fortschrittsbalken, Mahlzeiten eintragen, Kreatin abhaken (mit Streak 🔥)
- **🍽️ Essen** — Foto vom Essen schicken oder einfach beschreiben, die KI (gpt-4o-mini) schätzt Kalorien & Protein; Korrekturen per Chat („hab nur die Hälfte gegessen")
- **📅 Kalender** — Trainings pro Tag mit Muskelgruppen und Intensität, Warnung bei vernachlässigten Muskelgruppen, 💊-Marker für Kreatin-Tage
- **🏋️ Geräte** — Geräte mit Gewichts-Historie (welches Gewicht stelle ich wo ein?)
- **📸 Fotos** — Progress-Fotos mit Datum, Galerie + Vergleichsansicht (vorher/nachher nebeneinander)
- **📊 Statistik** — Wochen-/Monatsauswertung, KI-generiertes Monats-Recap vom „Coach"
- **💊 Kreatin-Erinnerung** — Push-Nachricht aufs Handy um 18 und 21 Uhr, aber nur, wenn man an dem Tag noch nicht abgehakt hat

## Multi-User

- Registrierung mit **Benutzername + Passwort** oder **Google** — neue Konten warten, bis der Admin sie freischaltet
- Jeder sieht **nur seine eigenen Daten** (erzwungen durch Firestore Security Rules)
- **Admin-Bereich** in den Einstellungen: Nutzer freischalten/sperren, KI-Funktionen pro Nutzer an/aus, Tageslimit für KI-Anfragen setzen, Verbrauch einsehen
- Ohne KI-Freigabe ist der OpenAI-Key durch die Security Rules technisch unerreichbar; das Tageslimit wird in der App geprüft und gezählt

## Tech-Stack

| Was | Womit |
|---|---|
| Frontend | Vite + React + TypeScript + Tailwind CSS v4 |
| PWA | vite-plugin-pwa (injectManifest, eigener Service Worker mit Web-Push) |
| Backend | Firebase: Hosting + Firestore + Auth — komplett auf dem **kostenlosen Spark-Plan**, keine Cloud Functions |
| KI | OpenAI gpt-4o-mini, direkt vom Client (Key liegt in Firestore, Zugriff per Rules beschränkt) |
| Push-Versand | GitHub Actions Cron (`.github/workflows/creatine.yml`) + Web Push (VAPID) — der Gratis-Plan kann selbst keine zeitgesteuerten Nachrichten senden, also übernimmt das ein kostenloser Actions-Job |
| Fotos | Client-seitig komprimiert (max. ~700 KB) als Base64 in Firestore — Firebase Storage braucht inzwischen den Bezahl-Plan |

## Wie die Kreatin-Erinnerung funktioniert

1. GitHub Actions läuft um 16/17/19/20 Uhr UTC (`scripts/remind.mjs` filtert selbst auf 18/21 Uhr Berlin — so löst sich Sommer-/Winterzeit von allein)
2. Das Skript holt sich per Service Account alle aktiven Nutzer aus Firestore
3. Wer heute schon abgehakt hat (`users/{uid}/creatine/{datum}` existiert), wird übersprungen
4. Alle anderen bekommen eine Web-Push-Nachricht auf alle registrierten Geräte; tote Subscriptions werden aufgeräumt

Benötigte GitHub-Secrets: `FIREBASE_SA_KEY` (Service-Account-JSON), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

## Datenmodell (Firestore)

```
users/{uid}                      Profil: name, role, status, aiEnabled, aiDailyLimit
users/{uid}/meals|workouts|machines|creatine|photos|recaps/…
users/{uid}/pushSubs/{id}        Web-Push-Subscriptions der Geräte
users/{uid}/aiUsage/{datum}      Zähler fürs KI-Tageslimit
users/{uid}/config/settings      persönliche Ziele + Theme
config/secrets                   OpenAI-Key (Lesen nur mit KI-Freigabe)
```

## Entwicklung

```bash
npm install
npm run dev          # lokaler Dev-Server
npm run build        # tsc + vite build → dist/
firebase deploy --only hosting   # deployt auf beide Sites (eduart + eduard)
```

Nützliche Skripte in `scripts/`:

- `gapi.mjs` — Google-APIs mit dem firebase-tools-Login aufrufen (token/enable/get/post/patch)
- `remind.mjs` — der Kreatin-Reminder (läuft in GitHub Actions, lokal testbar mit `FORCE=1`)
- `test-multiuser.mjs` — 10 automatische Tests der Security Rules mit einem Wegwerf-Konto
- `verify.mjs` — Backend-Smoke-Tests (braucht `APP_PASSWORD` als Env-Variable)
- `migrate.mjs` — einmalige Migration zur Multi-User-Struktur (bereits gelaufen)

## Hinweise

- Auf dem iPhone gibt es Push-Nachrichten nur, wenn die App über Safari → Teilen → **„Zum Home-Bildschirm"** installiert wurde (iOS 16.4+)
- GitHub Actions Cron kann 5–15 Minuten verspätet auslösen — für eine Kreatin-Erinnerung okay
- Der Firebase-API-Key im Code ist **kein Geheimnis** — er identifiziert nur das Projekt; die Sicherheit kommt von den Firestore Security Rules (`firestore.rules`)

---

Gebaut mit [Claude Code](https://claude.com/claude-code) 🤖
