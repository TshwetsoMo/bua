// app/providers.tsx
"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase/client";

type AuthCtx = { user: User | null; loading: boolean };
const AuthContext = createContext<AuthCtx>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);

export default function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setLoading(false); }), []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}