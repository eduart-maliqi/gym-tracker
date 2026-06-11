// Tests the exact OpenAI flows the app uses: text estimate, correction, vision.
import sharp from "sharp";

const KEY = process.env.OPENAI_KEY;
const SYSTEM = `Du bist ein Ernährungs-Assistent in einer Kalorien-Tracking-App.
Der Nutzer schickt dir Fotos von Essen oder beschreibt sein Essen. Schätze Kalorien (kcal) und Protein (Gramm) realistisch für die GESAMTE gezeigte/beschriebene Portion.
Wenn der Nutzer etwas korrigiert (z.B. "ich habe nur die Hälfte gegessen" oder "es war mit extra Käse"), passe deine Schätzung entsprechend an.
Antworte IMMER ausschließlich mit gültigem JSON in genau diesem Format:
{"reply": "kurze, freundliche Antwort auf Deutsch (erkläre kurz, was du siehst und wie du schätzt)", "estimate": {"name": "kurzer Name des Essens", "kcal": 0, "protein": 0}}
Wenn du keine Schätzung abgeben kannst (z.B. reine Frage ohne Essen), setze "estimate" auf null.`;

async function call(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      temperature: 0.4,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  return JSON.parse((await res.json()).choices[0].message.content);
}

// 1. text estimate
const history = [{ role: "user", content: "Döner mit allem" }];
const r1 = await call(history);
console.log("1) Döner:", JSON.stringify(r1));
if (!r1.estimate || !(r1.estimate.kcal > 200)) throw new Error("estimate fehlt/unplausibel");

// 2. correction
history.push({ role: "assistant", content: JSON.stringify(r1) });
history.push({ role: "user", content: "Ich habe nur die Hälfte gegessen" });
const r2 = await call(history);
console.log("2) Korrektur:", JSON.stringify(r2));
if (!r2.estimate || r2.estimate.kcal >= r1.estimate.kcal)
  throw new Error("Korrektur hat kcal nicht reduziert");

// 3. vision with data URL (same shape the app sends)
const png = await sharp({
  create: { width: 256, height: 256, channels: 3, background: { r: 255, g: 220, b: 60 } },
}).jpeg().toBuffer();
const dataUrl = `data:image/jpeg;base64,${png.toString("base64")}`;
const r3 = await call([
  {
    role: "user",
    content: [
      { type: "text", text: "Was ist das und wie viele Kalorien hat es?" },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  },
]);
console.log("3) Vision (Testbild):", JSON.stringify(r3).slice(0, 250));

console.log("\nAlle Chat-Tests OK");
