// lib/firebase/admin.ts
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT; // JSON string

if (!serviceAccountJson) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT env var is missing");
}

const app: App = getApps().length
  ? getApps()[0]!
  : initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
