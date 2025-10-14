//bua/src/lib/auth/UserContext.tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebase/client";

type Ctx = { user: User | null; loading: boolean };
const UserCtx = createContext<Ctx>({ user: null, loading: true });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return <UserCtx.Provider value={{ user, loading }}>{children}</UserCtx.Provider>;
}

export function useUser() {
  return useContext(UserCtx);
}