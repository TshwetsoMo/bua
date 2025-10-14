"use client";
import { useEffect, useState } from "react";
import { db } from "../lib/firebase/client";
import { doc, getDoc } from "firebase/firestore";
import { useUser } from "../lib/auth/UserContext";

export function RoleGate({
  allow,
  children,
}: {
  allow: Array<"student" | "admin">;
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!user) {
        if (!cancelled) setOk(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const role =
          (snap.data()?.role as "student" | "admin" | undefined) ?? "student";
        if (!cancelled) setOk(allow.includes(role));
      } catch {
        if (!cancelled) setOk(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [user, allow]);

  if (ok === null)
    return <p className="text-sm text-slate-600">Loading role…</p>;
  if (!ok)
    return (
      <p className="text-sm text-red-600">
        You don’t have access to this page.
      </p>
    );
  return <>{children}</>;
}