import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  projectId: "gym-tracker-eduard",
  appId: "1:360991904888:web:8a85e5f7d80ecd91cf898d",
  storageBucket: "gym-tracker-eduard.firebasestorage.app",
  apiKey: "AIzaSyD5a_zkMDh2qT_jGC2bs8pkkK64OowyrWc",
  authDomain: "gym-tracker-eduard.firebaseapp.com",
  messagingSenderId: "360991904888",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Offline-Persistenz: Lesezugriffe kommen ohne Netz aus dem IndexedDB-Cache,
// Schreibzugriffe werden gepuffert und automatisch synchronisiert.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Benutzername-Konten laufen intern über eine Pseudo-E-Mail (wird nie verschickt)
const USERNAME_DOMAIN = "gym-tracker-eduart.web.app";

export function usernameToEmail(name: string): string {
  return `${name.toLowerCase()}@${USERNAME_DOMAIN}`;
}

export function isUsernameAccount(user: User): boolean {
  return user.email?.endsWith(`@${USERNAME_DOMAIN}`) ?? false;
}

export function validUsername(name: string): boolean {
  return /^[a-z0-9_-]{3,20}$/.test(name.toLowerCase());
}

/** Login mit Benutzername ODER E-Mail (enthält "@" → echte E-Mail). */
export function login(nameOrEmail: string, password: string) {
  const id = nameOrEmail.trim();
  const email = id.includes("@") ? id : usernameToEmail(id);
  return signInWithEmailAndPassword(auth, email, password);
}

export async function register(username: string, password: string) {
  const name = username.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(name), password);
  await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

// Hinweis: Auf einer iPhone-PWA kann das Google-Popup haken — Benutzername/Passwort
// funktioniert immer als Ausweg.
export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return cred.user;
}

export function logout() {
  return signOut(auth);
}

export function watchAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function changePassword(current: string, next: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error("Nicht eingeloggt");
  const cred = EmailAuthProvider.credential(user.email, current);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, next);
}
