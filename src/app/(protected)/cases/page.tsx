//bua/src/app/(protected)/cases/page.tsx

"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../../../lib/firebase/client";
import { useUser } from "../../../lib/auth/UserContext";
import { RoleGate } from "../../../components/RoleGate";

type Case = {
  id: string;
  category: string;
  status: string;
  createdAt?: { seconds: number; nanoseconds: number };
};

function formatDate(ts?: { seconds: number }) {
  if (!ts) return "";
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function CasesPage() {
  const { user } = useUser();
  const [items, setItems] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const qRef = query(
      collection(db, "cases"),
      where("studentId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const arr: Case[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        setItems(arr);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user]);

  return (
    <RoleGate allow={["student"]}>
      <main className="space-y-6">
        <h1 className="text-xl font-semibold">My Cases</h1>
        {loading && <p className="text-sm text-slate-600">Loading…</p>}
        {!loading && (
          <div className="space-y-3">
            {items.map((c) => (
              <div
                key={c.id}
                className="rounded border bg-white p-4 shadow-sm hover:shadow transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium capitalize">{c.category}</p>
                  <span className="rounded-full border px-2 py-0.5 text-xs capitalize bg-slate-50">
                    {c.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 flex gap-4">
                  <span>ID: {c.id}</span>
                  {c.createdAt && <span>{formatDate(c.createdAt)}</span>}
                </p>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-slate-600">No cases yet.</p>
            )}
          </div>
        )}
      </main>
    </RoleGate>
  );
}