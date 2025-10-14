// bua/src/lib/firebase/client.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCO_kPbTBt_OBIqaxok1MJRVkQfeHHs4dU",
  authDomain: "saas-3ea29.firebaseapp.com",
  projectId: "saas-3ea29",
  // use the appspot.com bucket name (check Firebase Console -> Storage -> Bucket name)
  storageBucket: "saas-3ea29.appspot.com",
  messagingSenderId: "531029578425",
  appId: "1:531029578425:web:60929443c0d27526fac168",
  measurementId: "G-TP0QN1TR6B"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
