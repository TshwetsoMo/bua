//bua/src/app/(protected)/report/page.tsx

"use client";

import { useState } from "react";
import { doc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase/client";
import { useUser } from "../../../lib/auth/UserContext";
import { RoleGate } from "../../../components/RoleGate";

const CATEGORIES = [
  { value: "bullying", label: "Bullying / Harassment" },
  { value: "safety", label: "Safety / Wellbeing" },
  { value: "discrimination", label: "Discrimination" },
  { value: "academic", label: "Academic / Classroom" },
  { value: "facilities", label: "Facilities / Environment" },
  { value: "other", label: "Other" },
];

function basicRedact(text: string) {
  let t = text;
  // Emails
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]");
  // Phone-like numbers
  t = t.replace(/\b(\+?\d[\d\s\-()]{6,}\d)\b/g, "[redacted number]");
  // Social handles (very naive)
  t = t.replace(/@[\w_.-]{3,}/g, "@[redacted_handle]");
  return t;
}

export default function ReportPage() {
  const { user } = useUser();
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setOk(null);
    setErr(null);
    if (description.trim().length < 20) {
      setErr("Please provide at least a short paragraph (20+ chars).");
      return;
    }
    setSubmitting(true);
    try {
      const clean = basicRedact(description.trim());
      await addDoc(collection(db, "reports"), {
        userId: user.uid,
        category,
        description: clean,
        originalLength: description.trim().length,
        status: "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDescription("");
      setCategory(CATEGORIES[0].value);
      setOk("Report submitted. You can track it in your cases soon.");
    } catch (e: any) {
      setErr(e.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RoleGate allow={["student"]}>
      <main className="space-y-6">
        <h1 className="text-xl font-semibold">Report an Issue</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Category</span>
            <select
              className="w-full rounded border p-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

            <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Describe what happened</span>
            <textarea
              className="w-full rounded border p-2 text-sm"
              rows={6}
              placeholder="Explain what happened, when and where. Don’t include names, emails, phone numbers or social links."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {ok && <p className="text-sm text-emerald-700">{ok}</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}

          <button
            disabled={submitting}
            className="rounded bg-indigo-600 px-4 py-2 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </form>

        <p className="text-xs text-slate-500">
          ⚠️ If you’re in immediate danger, contact emergency services or a trusted adult.
        </p>
      </main>
    </RoleGate>
  );
}