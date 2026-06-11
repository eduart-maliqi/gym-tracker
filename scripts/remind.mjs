// Kreatin-Reminder: läuft in GitHub Actions (siehe .github/workflows/creatine.yml).
// Schickt eine Web-Push-Nachricht an alle Geräte in der Firestore-Collection "pushSubs",
// außer Kreatin wurde heute schon abgehakt (Doc creatine/{YYYY-MM-DD} existiert).
//
// Env: FIREBASE_SA_KEY (Service-Account-JSON), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//      FORCE=1 (Test: Uhrzeit-Check überspringen)
import { createSign } from "node:crypto";
import webpush from "web-push";

const PROJECT = "gym-tracker-eduard";
const REMIND_HOURS = [18, 21];
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// --- Berlin time (DST-safe) ---
const parts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  })
    .formatToParts(new Date())
    .map((p) => [p.type, p.value])
);
const berlinDate = `${parts.year}-${parts.month}-${parts.day}`;
const berlinHour = Number(parts.hour);

if (!process.env.FORCE && !REMIND_HOURS.includes(berlinHour)) {
  console.log(`Berlin time is ${berlinHour}:xx — not a reminder hour, exiting.`);
  process.exit(0);
}

// --- Service account access token ---
// Secrets uploaded from Windows can carry a UTF-8 BOM — cut everything before the first "{"
const saRaw = process.env.FIREBASE_SA_KEY;
const sa = JSON.parse(saRaw.slice(saRaw.indexOf("{")));
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const unsigned =
  b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
  "." +
  b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
const jwt = unsigned + "." + b64url(createSign("RSA-SHA256").update(unsigned).sign(sa.private_key));
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }),
});
const tokenData = await tokenRes.json();
if (!tokenData.access_token) {
  console.error("Service account token exchange failed:", JSON.stringify(tokenData));
  process.exit(1);
}
const auth = { Authorization: `Bearer ${tokenData.access_token}` };

// --- Per user: skip if creatine taken today, otherwise notify their devices ---
webpush.setVapidDetails(
  "mailto:admin@gym-tracker-eduart.web.app",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const payload = JSON.stringify({
  title: "💊 Kreatin-Zeit!",
  body:
    berlinHour === 21
      ? "Letzte Erinnerung für heute: Kreatin nehmen und in der App abhaken!"
      : "Denk an dein Kreatin — danach in der App abhaken, dann bleibt's heute ruhig.",
});

const usersRes = await fetch(`${FIRESTORE}/users?pageSize=300`, { headers: auth });
if (!usersRes.ok) {
  console.error(`Loading users failed: HTTP ${usersRes.status}`, await usersRes.text());
  process.exit(1);
}
const userDocs = (await usersRes.json()).documents ?? [];

let sent = 0;
let skipped = 0;
for (const u of userDocs) {
  const uid = u.name.split("/").pop();
  const name = u.fields?.name?.stringValue ?? uid;
  if (u.fields?.status?.stringValue !== "active") continue;

  const takenRes = await fetch(`${FIRESTORE}/users/${uid}/creatine/${berlinDate}`, {
    headers: auth,
  });
  if (takenRes.ok) {
    skipped++;
    continue; // schon abgehakt
  }
  if (takenRes.status !== 404) {
    console.error(`Creatine check failed for ${name}: HTTP ${takenRes.status}`);
    continue;
  }

  const subsRes = await fetch(`${FIRESTORE}/users/${uid}/pushSubs?pageSize=50`, {
    headers: auth,
  });
  if (!subsRes.ok) {
    console.error(`Loading pushSubs failed for ${name}: HTTP ${subsRes.status}`);
    continue;
  }
  const docs = (await subsRes.json()).documents ?? [];

  for (const d of docs) {
    const f = d.fields;
    const sub = {
      endpoint: f.endpoint.stringValue,
      keys: {
        p256dh: f.keys.mapValue.fields.p256dh.stringValue,
        auth: f.keys.mapValue.fields.auth.stringValue,
      },
    };
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      console.error(
        `Send failed for ${name} (HTTP ${err.statusCode ?? "?"}) ${sub.endpoint.slice(0, 50)}…`
      );
      if (err.statusCode === 404 || err.statusCode === 410) {
        // subscription is dead — remove it
        await fetch(`https://firestore.googleapis.com/v1/${d.name}`, {
          method: "DELETE",
          headers: auth,
        });
        console.log(`Removed dead subscription of ${name}.`);
      }
    }
  }
}
console.log(
  `Done: ${sent} notifications sent, ${skipped} users already done (${berlinDate} ${berlinHour}:00 Berlin).`
);
