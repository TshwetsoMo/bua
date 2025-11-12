// bua/hooks/useAuth.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "../../types";
import { Role } from "../../types";
import { auth, db } from "../lib/firebase/client";

type AuthPage = "signin" | "signup";

function normalizeRole(roleFromDoc: unknown): Role {
  
  if (typeof roleFromDoc === "number") {
    return roleFromDoc === Role.Admin ? Role.Admin : Role.Student;
  }
  if (typeof roleFromDoc === "string") {
    const lower = roleFromDoc.toLowerCase().trim();
    
    const asNum = Number.parseInt(roleFromDoc, 10);
    if (!Number.isNaN(asNum)) {
      return asNum === Role.Admin ? Role.Admin : Role.Student;
    }
    
    if (lower === "admin") return Role.Admin;
    if (lower === "student") return Role.Student;
  }
  return Role.Student;
}

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeAuthPage, setActiveAuthPage] = useState<AuthPage>("signin");
  const [initializing, setInitializing] = useState<boolean>(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          setCurrentUser(null);
          return;
        }

        let roleValue: Role = Role.Student;
        let nameValue = fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Student";

        try {
          const ref = doc(db, "users", fbUser.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data();
            roleValue = normalizeRole(data.role);
            if (data.name) nameValue = String(data.name);
          }
        } catch (err) {
          // Keep defaults if the profile doc can't be read
          console.warn("Failed to fetch user profile doc:", err);
        }

        setCurrentUser({
          id: fbUser.uid,
          name: nameValue,
          role: roleValue,
        });
      } catch (e) {
        console.error("useAuth onAuthStateChanged error:", e);
        setCurrentUser(null);
      } finally {
        setInitializing(false);
      }
    });

    return () => unsub();
  }, []);

  return { currentUser, setCurrentUser, activeAuthPage, setActiveAuthPage, initializing };
};
