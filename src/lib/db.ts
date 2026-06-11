import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  documentId,
  increment,
  onSnapshot,
  serverTimestamp,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ---------- Pfad-Helfer: alle persönlichen Daten liegen unter users/{uid}/… ----------

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Nicht eingeloggt");
  return u.uid;
}

function userCol(name: string): CollectionReference {
  return collection(db, "users", uid(), name);
}

function userDoc(col: string, id: string): DocumentReference {
  return doc(db, "users", uid(), col, id);
}

/**
 * Alltags-Schreibzugriffe warten nicht auf die Server-Bestätigung: Firestore
 * schreibt sofort in den lokalen Cache (die UI aktualisiert sich über die
 * Watcher) und synchronisiert, sobald wieder Netz da ist. Mit await würde
 * die UI offline endlos im Lade-Zustand hängen.
 */
function queued(write: Promise<unknown>): Promise<void> {
  write.catch((e) => console.error("Firestore-Schreibfehler:", e));
  return Promise.resolve();
}

// ---------- Nutzerprofile ----------

export type UserStatus = "pending" | "active" | "blocked";

export interface UserProfile {
  id: string; // == uid
  name: string;
  provider: "password" | "google";
  role: "admin" | "member";
  status: UserStatus;
  aiEnabled: boolean;
  aiDailyLimit: number;
}

export async function getMyProfile(): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid()));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as UserProfile) : null;
}

export function watchMyProfile(cb: (p: UserProfile | null) => void) {
  return onSnapshot(doc(db, "users", uid()), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as UserProfile) : null)
  );
}

/** Selbstregistrierung: Regeln erzwingen pending/member/ohne KI. */
export async function createMyProfile(name: string, provider: UserProfile["provider"]) {
  await setDoc(doc(db, "users", uid()), {
    name,
    provider,
    role: "member",
    status: "pending",
    aiEnabled: false,
    aiDailyLimit: 10,
    createdAt: serverTimestamp(),
  });
}

// --- Admin ---

export function watchAllUsers(cb: (users: UserProfile[]) => void) {
  return onSnapshot(collection(db, "users"), (snap) => {
    const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserProfile);
    users.sort((a, b) => a.name.localeCompare(b.name, "de"));
    cb(users);
  });
}

export async function updateUser(
  userId: string,
  data: Partial<Pick<UserProfile, "status" | "aiEnabled" | "aiDailyLimit">>
) {
  await updateDoc(doc(db, "users", userId), data);
}

export async function getUserAiUsageToday(userId: string, date: string): Promise<number> {
  const snap = await getDoc(doc(db, "users", userId, "aiUsage", date));
  return snap.exists() ? ((snap.data().count as number) ?? 0) : 0;
}

// ---------- KI-Nutzungszähler ----------

export async function getAiUsage(date: string): Promise<number> {
  const snap = await getDoc(userDoc("aiUsage", date));
  return snap.exists() ? ((snap.data().count as number) ?? 0) : 0;
}

export async function incrementAiUsage(date: string) {
  await setDoc(userDoc("aiUsage", date), { count: increment(1) }, { merge: true });
}

// ---------- Meals ----------

export type MealSource = "manual" | "photo" | "chat";

export interface Meal {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  kcal: number;
  protein: number;
  source: MealSource;
}

export type Intensity = "hart" | "mittel" | "leicht";

export const MUSCLE_GROUPS = [
  "Cardio",
  "Brust",
  "Schulter",
  "Bauch",
  "Bizeps",
  "Trizeps",
  "Unterer Rücken",
  "Oberer Rücken",
  "Beine",
  "Unterarme",
] as const;

export interface WorkoutGroup {
  name: string;
  intensity: Intensity;
}

export interface Workout {
  date: string; // YYYY-MM-DD == doc id
  groups: WorkoutGroup[];
  note: string;
}

export interface Settings {
  kcalGoal: number;
  proteinGoal: number;
  theme: "dark" | "light";
}

export interface Recap {
  month: string; // YYYY-MM
  type: "final" | "interim";
  text: string;
  createdAt?: unknown;
}

export const DEFAULT_SETTINGS: Settings = {
  kcalGoal: 2500,
  proteinGoal: 150,
  theme: "dark",
};

export function watchMeals(date: string, cb: (meals: Meal[]) => void) {
  const q = query(userCol("meals"), where("date", "==", date));
  return onSnapshot(q, (snap) => {
    const meals = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Meal);
    meals.sort((a, b) => a.id.localeCompare(b.id));
    cb(meals);
  });
}

export function addMeal(meal: Omit<Meal, "id">) {
  return queued(addDoc(userCol("meals"), { ...meal, createdAt: serverTimestamp() }));
}

export function updateMeal(id: string, data: Partial<Omit<Meal, "id">>) {
  return queued(updateDoc(userDoc("meals", id), data));
}

export function deleteMeal(id: string) {
  return queued(deleteDoc(userDoc("meals", id)));
}

export async function getMealsInRange(from: string, to: string): Promise<Meal[]> {
  const q = query(userCol("meals"), where("date", ">=", from), where("date", "<=", to));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Meal);
}

// ---------- Workouts ----------

export async function getWorkout(date: string): Promise<Workout | null> {
  const snap = await getDoc(userDoc("workouts", date));
  return snap.exists() ? (snap.data() as Workout) : null;
}

export function saveWorkout(w: Workout) {
  return queued(setDoc(userDoc("workouts", w.date), { ...w, createdAt: serverTimestamp() }));
}

export function deleteWorkout(date: string) {
  return queued(deleteDoc(userDoc("workouts", date)));
}

export async function getWorkoutsInRange(from: string, to: string): Promise<Workout[]> {
  const q = query(
    userCol("workouts"),
    where("date", ">=", from),
    where("date", "<=", to),
    orderBy("date")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Workout);
}

// ---------- Machines (Geräte & Gewichte) ----------

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  kg: number;
}

export interface Machine {
  id: string;
  name: string;
  history: WeightEntry[]; // chronological, last = current
}

export function watchMachines(cb: (machines: Machine[]) => void) {
  return onSnapshot(userCol("machines"), (snap) => {
    const machines = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Machine);
    machines.sort((a, b) => a.name.localeCompare(b.name, "de"));
    cb(machines);
  });
}

export function addMachine(name: string, kg: number, date: string) {
  return queued(
    addDoc(userCol("machines"), {
      name,
      history: [{ date, kg }],
      createdAt: serverTimestamp(),
    })
  );
}

export function updateMachine(id: string, data: Partial<Omit<Machine, "id">>) {
  return queued(updateDoc(userDoc("machines", id), data));
}

export function deleteMachine(id: string) {
  return queued(deleteDoc(userDoc("machines", id)));
}

// ---------- Kreatin ----------

export function watchCreatine(date: string, cb: (taken: boolean) => void) {
  return onSnapshot(userDoc("creatine", date), (snap) => cb(snap.exists()));
}

export function setCreatineTaken(date: string, taken: boolean) {
  return queued(
    taken
      ? setDoc(userDoc("creatine", date), { taken: true, createdAt: serverTimestamp() })
      : deleteDoc(userDoc("creatine", date))
  );
}

/** Dates (YYYY-MM-DD) with creatine taken, within [from, to] */
export async function getCreatineInRange(from: string, to: string): Promise<string[]> {
  const q = query(
    userCol("creatine"),
    where(documentId(), ">=", from),
    where(documentId(), "<=", to)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.id);
}

// ---------- Progress-Fotos ----------

export interface ProgressPhoto {
  id: string;
  date: string; // YYYY-MM-DD
  image: string; // compressed JPEG data URL
}

export function watchPhotos(cb: (photos: ProgressPhoto[]) => void) {
  const q = query(userCol("photos"), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProgressPhoto));
  });
}

export function addPhoto(date: string, image: string) {
  return queued(addDoc(userCol("photos"), { date, image, createdAt: serverTimestamp() }));
}

export function deletePhoto(id: string) {
  return queued(deleteDoc(userDoc("photos", id)));
}

// ---------- Push-Subscriptions ----------

export async function savePushSub(id: string, sub: PushSubscriptionJSON) {
  await setDoc(userDoc("pushSubs", id), {
    endpoint: sub.endpoint,
    keys: sub.keys,
    createdAt: serverTimestamp(),
  });
}

export async function deletePushSub(id: string) {
  await deleteDoc(userDoc("pushSubs", id));
}

// ---------- Settings / secrets ----------

export async function getSettings(): Promise<Settings> {
  const snap = await getDoc(userDoc("config", "settings"));
  return snap.exists()
    ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings>) }
    : DEFAULT_SETTINGS;
}

export function saveSettings(s: Partial<Settings>) {
  return queued(setDoc(userDoc("config", "settings"), s, { merge: true }));
}

// ---------- Wochenplan (optional) ----------

/** Muskelgruppen pro Wochentag; Schlüssel "0" (Mo) … "6" (So), fehlend/leer = nichts geplant. */
export type WeekPlan = Record<string, string[]>;

export async function getWeekPlan(): Promise<WeekPlan> {
  const snap = await getDoc(userDoc("config", "weekplan"));
  return snap.exists() ? (snap.data() as WeekPlan) : {};
}

export function saveWeekPlan(plan: WeekPlan) {
  return queued(setDoc(userDoc("config", "weekplan"), plan));
}

export async function getOpenAiKey(): Promise<string> {
  const snap = await getDoc(doc(db, "config", "secrets"));
  const key = snap.exists() ? (snap.data().openaiKey as string) : "";
  if (!key) throw new Error("Kein OpenAI-Key in der Datenbank gefunden");
  return key;
}

// ---------- Recaps ----------

export async function getRecap(month: string, type: Recap["type"]): Promise<Recap | null> {
  const snap = await getDoc(userDoc("recaps", `${month}-${type}`));
  return snap.exists() ? (snap.data() as Recap) : null;
}

export async function saveRecap(recap: Recap) {
  await setDoc(userDoc("recaps", `${recap.month}-${recap.type}`), {
    ...recap,
    createdAt: serverTimestamp(),
  });
}
