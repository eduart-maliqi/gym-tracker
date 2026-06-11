// One-time setup: create the auth user (if needed), store the OpenAI key and
// default settings in Firestore. Secrets are passed via environment variables:
//   OPENAI_KEY  - the OpenAI API key to store
//   APP_PASSWORD - password for the single user account
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  projectId: "gym-tracker-eduard",
  appId: "1:360991904888:web:8a85e5f7d80ecd91cf898d",
  apiKey: "AIzaSyD5a_zkMDh2qT_jGC2bs8pkkK64OowyrWc",
  authDomain: "gym-tracker-eduard.firebaseapp.com",
};

const EMAIL = process.env.ADMIN_EMAIL;
const password = process.env.APP_PASSWORD;
const openaiKey = process.env.OPENAI_KEY;

if (!password || !EMAIL) {
  console.error("APP_PASSWORD / ADMIN_EMAIL env vars missing");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let cred;
try {
  cred = await signInWithEmailAndPassword(auth, EMAIL, password);
  console.log("Signed in as existing user", cred.user.uid);
} catch (e) {
  console.log("Sign-in failed (" + e.code + "), trying to create user...");
  cred = await createUserWithEmailAndPassword(auth, EMAIL, password);
  console.log("Created user", cred.user.uid);
}

if (openaiKey) {
  await setDoc(doc(db, "config", "secrets"), { openaiKey }, { merge: true });
  console.log("OpenAI key stored.");
}

const settingsRef = doc(db, "config", "settings");
const existing = await getDoc(settingsRef);
if (!existing.exists()) {
  await setDoc(settingsRef, { kcalGoal: 2500, proteinGoal: 150, theme: "dark" });
  console.log("Default settings stored.");
} else {
  console.log("Settings already exist, leaving them.");
}

console.log("Done.");
process.exit(0);
