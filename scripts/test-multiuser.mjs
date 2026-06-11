// E2E-Test der Multi-User-Regeln mit einem Wegwerf-Testkonto.
// Usage: node scripts/test-multiuser.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECT = "gym-tracker-eduard";
const API_KEY = "AIzaSyD5a_zkMDh2qT_jGC2bs8pkkK64OowyrWc";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TEST_EMAIL = "testkollege@gym-tracker-eduard.web.app";
const TEST_PW = "test123456";

let pass = 0;
let fail = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  ok ? pass++ : fail++;
}

// Owner-Token (firebase-tools) für Admin-Aktionen
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const store = JSON.parse(
  readFileSync(join(homedir(), ".config", "configstore", "firebase-tools.json"), "utf8")
);
const ownerToken = (
  await (
    await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: store.tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    })
  ).json()
).access_token;
const ownerAuth = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };

// 1. Registrierung (signUp wie die App)
const signUp = await (
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PW, returnSecureToken: true }),
  })
).json();
check("Registrierung mit Benutzername-Pseudo-Mail", !!signUp.idToken);
const uid = signUp.localId;
const userAuth = { Authorization: `Bearer ${signUp.idToken}`, "Content-Type": "application/json" };

// 2. Eigenes Profil anlegen (pending) — muss erlaubt sein
const createProfile = await fetch(`${FIRESTORE}/users/${uid}`, {
  method: "PATCH",
  headers: userAuth,
  body: JSON.stringify({
    fields: {
      name: { stringValue: "testkollege" },
      provider: { stringValue: "password" },
      role: { stringValue: "member" },
      status: { stringValue: "pending" },
      aiEnabled: { booleanValue: false },
      aiDailyLimit: { integerValue: "10" },
    },
  }),
});
check("Profil anlegen (pending)", createProfile.ok);

// 3. Pending: darf eigene Daten NICHT schreiben/lesen
const writePending = await fetch(`${FIRESTORE}/users/${uid}/meals`, {
  method: "POST",
  headers: userAuth,
  body: JSON.stringify({ fields: { name: { stringValue: "test" } } }),
});
check("Pending: Mahlzeit schreiben gesperrt (403)", writePending.status === 403);

// 4. Pending: darf sich nicht selbst freischalten
const selfPromote = await fetch(`${FIRESTORE}/users/${uid}?updateMask.fieldPaths=status`, {
  method: "PATCH",
  headers: userAuth,
  body: JSON.stringify({ fields: { status: { stringValue: "active" } } }),
});
check("Pending: selbst freischalten gesperrt (403)", selfPromote.status === 403);

// 5. Pending: OpenAI-Key gesperrt
const keyPending = await fetch(`${FIRESTORE}/config/secrets`, { headers: userAuth });
check("Pending: OpenAI-Key gesperrt (403)", keyPending.status === 403);

// 6. Admin schaltet frei (Owner-Token simuliert Admin)
const approve = await fetch(`${FIRESTORE}/users/${uid}?updateMask.fieldPaths=status`, {
  method: "PATCH",
  headers: ownerAuth,
  body: JSON.stringify({ fields: { status: { stringValue: "active" } } }),
});
check("Admin: freischalten", approve.ok);

// 7. Aktiv: eigene Daten schreiben/lesen erlaubt
const writeActive = await fetch(`${FIRESTORE}/users/${uid}/meals`, {
  method: "POST",
  headers: userAuth,
  body: JSON.stringify({
    fields: { name: { stringValue: "Testessen" }, date: { stringValue: "2026-06-11" } },
  }),
});
check("Aktiv: eigene Mahlzeit schreiben", writeActive.ok);

// 8. Aktiv ohne KI: Key bleibt gesperrt
const keyNoAi = await fetch(`${FIRESTORE}/config/secrets`, { headers: userAuth });
check("Aktiv ohne KI: OpenAI-Key gesperrt (403)", keyNoAi.status === 403);

// 9. Admin schaltet KI frei → Key lesbar
await fetch(`${FIRESTORE}/users/${uid}?updateMask.fieldPaths=aiEnabled`, {
  method: "PATCH",
  headers: ownerAuth,
  body: JSON.stringify({ fields: { aiEnabled: { booleanValue: true } } }),
});
const keyWithAi = await fetch(`${FIRESTORE}/config/secrets`, { headers: userAuth });
check("Aktiv mit KI: OpenAI-Key lesbar", keyWithAi.ok);

// 10. Fremde Daten: Admin-Profil/Daten für Testnutzer gesperrt
const usersList = await fetch(`${FIRESTORE}/users?pageSize=10`, { headers: userAuth });
check("Nutzerliste für Member gesperrt (403)", usersList.status === 403);

// 11. Rollen-Check: Owner macht Testnutzer zum Admin → Nutzerliste jetzt erlaubt
await fetch(`${FIRESTORE}/users/${uid}?updateMask.fieldPaths=role`, {
  method: "PATCH",
  headers: ownerAuth,
  body: JSON.stringify({ fields: { role: { stringValue: "admin" } } }),
});
const usersListAdmin = await fetch(`${FIRESTORE}/users?pageSize=10`, { headers: userAuth });
check("Nutzerliste für Admin-Rolle erlaubt", usersListAdmin.ok);

// Aufräumen: Testkonto + Daten löschen
const testDocs = await (
  await fetch(`${FIRESTORE}/users/${uid}/meals?pageSize=10`, { headers: ownerAuth })
).json();
for (const d of testDocs.documents ?? []) {
  await fetch(`https://firestore.googleapis.com/v1/${d.name}`, {
    method: "DELETE",
    headers: ownerAuth,
  });
}
await fetch(`${FIRESTORE}/users/${uid}`, { method: "DELETE", headers: ownerAuth });
await fetch(
  `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
  { method: "POST", headers: ownerAuth, body: JSON.stringify({ localId: uid }) }
);
console.log("Testkonto aufgeräumt.");

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
