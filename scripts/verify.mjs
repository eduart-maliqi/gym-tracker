// End-to-end verification of the deployed app's backend flows.
const API_KEY = "AIzaSyD5a_zkMDh2qT_jGC2bs8pkkK64OowyrWc";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.APP_PASSWORD;
const BASE = "https://firestore.googleapis.com/v1/projects/gym-tracker-eduard/databases/(default)/documents";

let failed = false;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failed = true;
}

// 1. Hosting reachable
const site = await fetch("https://gym-tracker-eduard.web.app/");
const html = await site.text();
check("Hosting erreichbar", site.status === 200 && html.includes("Gym Tracker"));

// 2. Login via REST (same as the app)
const loginRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  }
);
const login = await loginRes.json();
check("Login mit Passwort", loginRes.status === 200 && !!login.idToken);
const token = login.idToken;

// 3. Read OpenAI key from Firestore (authenticated)
const secret = await fetch(`${BASE}/config/secrets`, {
  headers: { Authorization: `Bearer ${token}` },
});
const secretData = await secret.json();
const key = secretData.fields?.openaiKey?.stringValue ?? "";
check("OpenAI-Key lesbar (eingeloggt)", secret.status === 200 && key.startsWith("sk-"));

// 4. Unauthenticated read must be denied
const denied = await fetch(`${BASE}/config/secrets`);
check("Key OHNE Login gesperrt", denied.status === 403, `status=${denied.status}`);

// 5. Write + delete a test meal (authenticated)
const write = await fetch(`${BASE}/meals?documentId=verify-test`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    fields: {
      date: { stringValue: "2000-01-01" },
      name: { stringValue: "Test" },
      kcal: { integerValue: "1" },
      protein: { integerValue: "1" },
      source: { stringValue: "manual" },
    },
  }),
});
check("Mahlzeit schreiben", write.status === 200);
const del = await fetch(`${BASE}/meals/verify-test`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${token}` },
});
check("Mahlzeit löschen", del.status === 200);

// 6. Settings doc exists
const settings = await fetch(`${BASE}/config/settings`, {
  headers: { Authorization: `Bearer ${token}` },
});
const sData = await settings.json();
check(
  "Einstellungen vorhanden",
  settings.status === 200 && sData.fields?.kcalGoal?.integerValue === "2500"
);

process.exit(failed ? 1 : 0);
