// bua/hooks/useAuth.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "../../types";
import { Role } from "../../types";
import { auth, db } from "../lib/firebase/client";

type AuthPage = "signin" | "signup";

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeAuthPage, setActiveAuthPage] = useState<AuthPage>("signin");
  const [initializing, setInitializing] = useState<boolean>(true); // <-- new

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          setCurrentUser(null);
          setInitializing(false);
          return;
        }

        // attempt to read profile doc to get role/name if present
        let roleValue = Role.Student;
        let nameValue = fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Student";

        try {
          const ref = doc(db, "users", fbUser.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data();
            if (typeof data.role !== "undefined") roleValue = Number(data.role);
            if (data.name) nameValue = String(data.name);
          }
        } catch (err) {
          // non-fatal; keep defaults
          console.warn("Failed to fetch user profile doc:", err);
        }

        setCurrentUser({
          id: fbUser.uid,
          name: nameValue,
          role: Number.isNaN(roleValue) ? Role.Student : (roleValue as Role),
        });
      } catch (e) {
        console.error("useAuth onAuthStateChanged handler error:", e);
        setCurrentUser(null);
      } finally {
        setInitializing(false);
      }
    });

    return () => unsub();
  }, []);

  return { currentUser, setCurrentUser, activeAuthPage, setActiveAuthPage, initializing };
};

