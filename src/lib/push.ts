import { savePushSub, deletePushSub } from "./db";

// VAPID public key — public by design, the private key lives in GitHub Actions secrets.
const VAPID_PUBLIC_KEY =
  "BCCRj6IRNuqnvDugoocJWW5pYrpM0bnY4amBv0rHRJcSh4W4pQaOZnrBYvZsouIGHZ5xN7pO2mxj4hFagkXJllM";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function endpointId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS Safari only allows web push for PWAs added to the home screen. */
export function needsHomeScreenInstall(): boolean {
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return iOS && !standalone;
}

export async function getPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) !== null;
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error("Dein Browser unterstützt leider keine Push-Mitteilungen.");
  }
  if (needsHomeScreenInstall()) {
    throw new Error(
      "Füge die App zuerst zum Home-Bildschirm hinzu (Safari → Teilen → „Zum Home-Bildschirm“), dann klappt's."
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Mitteilungen wurden nicht erlaubt. Prüfe die Einstellungen deines Handys.");
  }
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys) throw new Error("Anmeldung für Push fehlgeschlagen.");
  await savePushSub(await endpointId(json.endpoint), json);
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const id = await endpointId(sub.endpoint);
  await sub.unsubscribe();
  await deletePushSub(id);
}
