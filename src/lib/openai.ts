import { getAiUsage, getMyProfile, getOpenAiKey, incrementAiUsage } from "./db";
import { today } from "./dates";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
}

export interface FoodEstimate {
  name: string;
  kcal: number;
  protein: number;
}

export interface FoodReply {
  reply: string;
  estimate: FoodEstimate | null;
}

const FOOD_SYSTEM_PROMPT = `Du bist ein Ernährungs-Assistent in einer Kalorien-Tracking-App.
Der Nutzer schickt dir Fotos von Essen oder beschreibt sein Essen. Schätze Kalorien (kcal) und Protein (Gramm) realistisch für die GESAMTE gezeigte/beschriebene Portion.
Wenn der Nutzer etwas korrigiert (z.B. "ich habe nur die Hälfte gegessen" oder "es war mit extra Käse"), passe deine Schätzung entsprechend an.
Antworte IMMER ausschließlich mit gültigem JSON in genau diesem Format:
{"reply": "kurze, freundliche Antwort auf Deutsch (erkläre kurz, was du siehst und wie du schätzt)", "estimate": {"name": "kurzer Name des Essens", "kcal": 0, "protein": 0}}
Wenn du keine Schätzung abgeben kannst (z.B. reine Frage ohne Essen), setze "estimate" auf null.`;

let cachedKey: string | null = null;

async function apiKey(): Promise<string> {
  if (!cachedKey) cachedKey = await getOpenAiKey();
  return cachedKey;
}

/** Prüft KI-Freigabe + Tageslimit und zählt die Anfrage. Admin ist unbegrenzt. */
async function assertAiAllowed(): Promise<void> {
  const profile = await getMyProfile();
  if (!profile) throw new Error("Profil nicht gefunden — bitte neu einloggen.");
  if (profile.role === "admin") return;
  if (!profile.aiEnabled) {
    throw new Error("Die KI-Funktionen sind für dich nicht freigeschaltet — frag Eduart.");
  }
  const date = today();
  const used = await getAiUsage(date);
  if (used >= profile.aiDailyLimit) {
    throw new Error(
      `KI-Tageslimit erreicht (${used}/${profile.aiDailyLimit}) — morgen geht's weiter.`
    );
  }
  await incrementAiUsage(date);
}

async function complete(messages: ChatMessage[], json: boolean): Promise<string> {
  await assertAiAllowed();
  const key = await apiKey();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 1000,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI-Fehler (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

/** Chat about food (with optional images in the messages). Returns reply + estimate. */
export async function foodChat(history: ChatMessage[]): Promise<FoodReply> {
  const content = await complete(
    [{ role: "system", content: FOOD_SYSTEM_PROMPT }, ...history],
    true
  );
  try {
    const parsed = JSON.parse(content);
    return {
      reply: String(parsed.reply ?? ""),
      estimate: parsed.estimate
        ? {
            name: String(parsed.estimate.name ?? "Essen"),
            kcal: Math.round(Number(parsed.estimate.kcal) || 0),
            protein: Math.round(Number(parsed.estimate.protein) || 0),
          }
        : null,
    };
  } catch {
    return { reply: content, estimate: null };
  }
}

/** Generate a German monthly recap from aggregated stats. */
export async function generateRecap(statsJson: string, interim: boolean): Promise<string> {
  const prompt = `Du bist ein motivierender Fitness-Coach. Hier sind die Trainings- und Ernährungsdaten eines Nutzers für ${
    interim ? "den laufenden Monat (Zwischenbilanz)" : "den vergangenen Monat"
  } als JSON:

${statsJson}

Schreibe auf Deutsch ein kurzes, persönliches Recap (Du-Form) mit:
1. Wie oft er im Gym war (und Vergleich zur Wochenfrequenz).
2. Was er viel trainiert hat (mit Intensität) und was wenig oder gar nicht.
3. Konkrete Empfehlung: welche Muskelgruppen er MEHR trainieren sollte und was er eventuell WENIGER machen kann, damit das Training ausgewogen ist.
4. Falls Ernährungsdaten vorhanden: kurzer Kommentar zu Kalorien/Protein im Schnitt vs. Ziel.
Maximal ca. 250 Wörter. Nutze kurze Absätze und Emojis sparsam. Keine Überschrift, kein Markdown mit #.`;
  return complete([{ role: "user", content: prompt }], false);
}

export { compressImage } from "./image";
