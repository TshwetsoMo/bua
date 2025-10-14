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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setCurrentUser(null);
        return;
      }
      
      const ref = doc(db, "users", fbUser.uid);
      const snap = await getDoc(ref);

      const roleValue =
        (snap.exists() ? (snap.data().role as number) : undefined) ?? Role.Student;
      const nameValue =
        (snap.exists() ? (snap.data().name as string) : undefined) ??
        fbUser.displayName ??
        fbUser.email?.split("@")[0] ??
        "Student";

      setCurrentUser({
        id: fbUser.uid,
        name: nameValue,
        role: roleValue,
      });
    });

    return () => unsub();
  }, []);

  return { currentUser, setCurrentUser, activeAuthPage, setActiveAuthPage };
};
