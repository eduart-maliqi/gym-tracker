// Einmalige Migration: verschiebt Eduards Daten aus den alten Top-Level-Collections
// nach users/{uid}/… und legt sein Admin-Profil an.
// Nutzt den firebase-tools-Login (wie gapi.mjs). Usage: node scripts/migrate.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT = "gym-tracker-eduard";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.error("ADMIN_EMAIL als Env-Variable setzen");
  process.exit(1);
}
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const COLLECTIONS = ["meals", "workouts", "machines", "creatine", "photos", "recaps", "pushSubs"];

// Public OAuth client of the firebase-tools CLI (same as gapi.mjs)
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

const store = JSON.parse(
  readFileSync(join(homedir(), ".config", "configstore", "firebase-tools.json"), "utf8")
);
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: store.tokens.refresh_token,
    grant_type: "refresh_token",
  }),
});
const token = (await tokenRes.json()).access_token;
if (!token) {
  console.error("Token exchange failed");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: auth,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// 1. Eduards uid finden
const lookup = await api(
  "POST",
  `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
  { email: [ADMIN_EMAIL] }
);
const uid = lookup.users?.[0]?.localId;
if (!uid) {
  console.error("Admin-Konto nicht gefunden");
  process.exit(1);
}
console.log(`Admin uid: ${uid}`);

// 2. Admin-Profil anlegen
await api("PATCH", `${FIRESTORE}/users/${uid}`, {
  fields: {
    name: { stringValue: "Eduard" },
    provider: { stringValue: "password" },
    role: { stringValue: "admin" },
    status: { stringValue: "active" },
    aiEnabled: { booleanValue: true },
    aiDailyLimit: { integerValue: "9999" },
    createdAt: { timestampValue: new Date().toISOString() },
  },
});
console.log("Admin-Profil angelegt.");

// 3. Collections kopieren, verifizieren, Original löschen
async function listAll(path) {
  const docs = [];
  let pageToken = "";
  do {
    const url = `${FIRESTORE}/${path}?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await api("GET", url);
    docs.push(...(data.documents ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

for (const col of COLLECTIONS) {
  const docs = await listAll(col);
  for (const d of docs) {
    const id = d.name.split("/").pop();
    await api("PATCH", `${FIRESTORE}/users/${uid}/${col}/${encodeURIComponent(id)}`, {
      fields: d.fields,
    });
  }
  const copied = await listAll(`users/${uid}/${col}`);
  if (copied.length < docs.length) {
    console.error(`FEHLER bei ${col}: ${copied.length}/${docs.length} kopiert — Originale bleiben!`);
    process.exit(1);
  }
  for (const d of docs) {
    await fetch(`https://firestore.googleapis.com/v1/${d.name}`, {
      method: "DELETE",
      headers: auth,
    });
  }
  console.log(`${col}: ${docs.length} Dokumente migriert.`);
}

// 4. config/settings → users/{uid}/config/settings (config/secrets bleibt global)
try {
  const settings = await api("GET", `${FIRESTORE}/config/settings`);
  await api("PATCH", `${FIRESTORE}/users/${uid}/config/settings`, { fields: settings.fields });
  await fetch(`${FIRESTORE}/config/settings`, { method: "DELETE", headers: auth });
  console.log("config/settings migriert.");
} catch {
  console.log("config/settings nicht vorhanden — übersprungen.");
}

console.log("Migration fertig ✅");
