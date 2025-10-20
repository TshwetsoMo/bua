// bua/src/lib/auth/UserContext.tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/client";
import { db } from "../firebase/client";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User as DomainUser } from "../../../types";
import { Role } from "../../../types";

type Ctx = { user: DomainUser | null; loading: boolean };
const UserCtx = createContext<Ctx>({ user: null, loading: true });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DomainUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fb) => {
      if (!fb) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "users", fb.uid);
        const snap = await getDoc(ref);

        // OPTIONAL: bootstrap missing profiles (helps older accounts)
        if (!snap.exists()) {
          const fallbackName = fb.displayName ?? fb.email?.split("@")[0] ?? "Student";
          await setDoc(ref, {
            name: fallbackName,
            role: Number(Role.Student),
            email: fb.email ?? null,
            createdAt: serverTimestamp(),
          });
          setUser({ id: fb.uid, name: fallbackName, role: Role.Student });
        } else {
          const data = snap.data() as any;
          const roleNum = Number(data.role);
          const safeRole = Number.isNaN(roleNum) ? Role.Student : (roleNum as Role);
          const name = data.name || fb.displayName || fb.email?.split("@")[0] || "Student";
          setUser({ id: fb.uid, name, role: safeRole });
        }
      } catch {
        // Hard fallback: logged-in but unknown profile => Student
        const name = fb.displayName ?? fb.email?.split("@")[0] ?? "Student";
        setUser({ id: fb.uid, name, role: Role.Student });
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return <UserCtx.Provider value={{ user, loading }}>{children}</UserCtx.Provider>;
}

export function useUser() {
  return useContext(UserCtx);
}
