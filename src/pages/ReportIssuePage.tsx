// bua/pages/ReportIssuePage.tsx
import React, { useMemo, useState } from "react";
import type { Case, User } from "../../types";
import { CaseStatus as CaseStatusEnum } from "../../types";
import { geminiService } from "../lib/gemini";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Select } from "@/components/Select";
import { Textarea } from "@/components/Textarea";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";

import { db, storage } from "../lib/firebase/client";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

interface ReportIssuePageProps {
  onNavigate: (page: string) => void;
  context: any;
  currentUser: User;
}

/** Helper to cap a string for title */
function toTitle(s: string, max = 60) {
  const t = s.trim();
  if (!t) return "Issue report";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

const CATEGORIES = ["Academics", "Bullying", "Facilities", "Policy", "Other"];

const ReportIssuePage: React.FC<ReportIssuePageProps> = ({ onNavigate, context, currentUser, addCase }) => {
  // Structured prefill (preferred)
  const structured = context?.prefillStructured as
    | { title?: string; category?: string; keyFacts?: string[]; description?: string }
    | undefined;

  // Legacy prefill (fallback)
  const legacyPrefill: string | undefined = context?.prefill;
  const legacyCategoryGuess: string | undefined = context?.categoryGuess;

  // Initial values
  const [category, setCategory] = useState<string>(() => {
    const fromAI = structured?.category || legacyCategoryGuess;
    return CATEGORIES.includes(fromAI || "") ? (fromAI as string) : "Academics";
  });
  const [description, setDescription] = useState<string>(() => {
    // Prefer structured.description, else legacyPrefill, else empty
    return (structured?.description || legacyPrefill || "").trim();
  });
  const [titleOverride, setTitleOverride] = useState<string>(() => (structured?.title || "").trim());

  const keyFacts: string[] = Array.isArray(structured?.keyFacts) ? structured!.keyFacts : [];

  const [evidence, setEvidence] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = description.length;
  const charHint = useMemo(() => {
    if (charCount < 200) return "Consider adding specific details (what, where, when).";
    if (charCount > 1200) return "You can keep it concise — aim for under 1,200 characters.";
    return "Looks good — you can submit whenever you're ready.";
  }, [charCount]);

  const guessedTitle = useMemo(() => {
    // If user overrides title, use that; else use structured title; else derive from description
    if (titleOverride) return titleOverride;
    if (structured?.title?.trim()) return structured!.title!.trim();
    if (description.trim()) return toTitle(description);
    return "Issue report";
  }, [titleOverride, structured?.title, description]);

  const guessEvidenceType = (file: File | null) => {
    if (!file) return "unknown";
    const t = file.type || "";
    if (t.startsWith("image/")) return "image";
    if (t === "application/pdf") return "pdf";
    if (t.startsWith("video/")) return "video";
    return "file";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Description cannot be empty.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1) Redact PII with your existing helper
      const redactedDescription = await geminiService.redactPII(description);

      // 2) Upload evidence (optional)
      let evidenceUrl: string | null = null;
      let evidenceType: string | null = null;
      if (evidence) {
        const fileNameSafe = `${Date.now()}_${(evidence.name || "evidence").replace(/\s+/g, "_")}`;
        const sRef = storageRef(storage, `evidence/${currentUser.id}/${fileNameSafe}`);
        await uploadBytes(sRef, evidence);
        evidenceUrl = await getDownloadURL(sRef);
        evidenceType = guessEvidenceType(evidence);
      }

      // 3) Build payload
      const now = new Date();
      const title = toTitle(guessedTitle);

      const casePayload: any = {
        studentId: currentUser.id,
        title,
        category,
        description,
        redactedDescription,
        status: CaseStatusEnum.Submitted,
        history: [
          {
            id: `msg${Date.now()}`,
            sender: "Student",
            text: "Case submitted.",
            timestamp: now, // client Date() for array items (serverTimestamp is not allowed in arrays)
          },
        ],
        createdAt: serverTimestamp(), // server timestamp OK at top level
        resolutionNote: "",
      };

      if (evidenceUrl) {
        casePayload.evidenceUrl = evidenceUrl;
        casePayload.evidenceType = evidenceType;
        casePayload.evidence = { count: 1, type: evidenceType };
      }

      // 4) Write to Firestore
      const docRef = await addDoc(collection(db, "cases"), casePayload);

      // 5) Optionally sync local state
      if (addCase) {
        const createdCase: Case = {
          id: docRef.id,
          studentId: currentUser.id,
          title,
          category,
          description,
          redactedDescription,
          evidence: null,
          status: CaseStatusEnum.Submitted,
          history: [
            {
              id: `msg${Date.now()}`,
              sender: "Student",
              text: "Case submitted.",
              timestamp: now,
            },
          ],
          resolutionNote: "",
          createdAt: now,
        };
        try {
          await addCase(createdCase);
        } catch {
          // non-fatal
        }
      }

      // 6) Navigate to tracker
      onNavigate("tracker");
    } catch (err) {
      console.error("Failed to submit case:", err);
      setError("Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Report an Issue</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Review the AI suggestions below, edit anything, and submit when ready.
        </p>
      </div>

      {(structured?.title || structured?.description || keyFacts.length > 0 || legacyPrefill) && (
        <Card className="mb-5 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60">
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">AI suggestions</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                Optional
              </span>
            </div>

            {structured?.title && (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">Suggested title:</span> {structured.title}
              </p>
            )}

            {keyFacts.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Key facts:</p>
                <ul className="mt-1 text-sm list-disc ml-5 text-slate-700 dark:text-slate-300">
                  {keyFacts.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            {legacyPrefill && !structured?.description && (
              <p className="text-sm mt-2 text-slate-700 dark:text-slate-300">
                <span className="font-medium">From chat:</span> {legacyPrefill}
              </p>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              These are starting points. You’re in control — please verify and edit.
            </p>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60">
        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Title (editable override) */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Title (optional)
            </label>
            <input
              id="title"
              type="text"
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder={guessedTitle}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              If left blank, we’ll use: <span className="italic">{guessedTitle}</span>
            </p>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium mb-1">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Describe the issue
            </label>
            <textarea
              id="description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">{charHint}</span>
              <span className="text-slate-400">{charCount} chars</span>
            </div>
          </div>

          {/* Evidence */}
          <div>
            <label htmlFor="evidence" className="block text-sm font-medium mb-1">
              Upload evidence (optional)
            </label>
            <input
              id="evidence"
              type="file"
              onChange={(e) => setEvidence(e.target.files ? e.target.files[0] : null)}
              className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700
                         hover:file:bg-blue-100 dark:file:bg-slate-700 dark:file:text-slate-200"
            />
            {evidence && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {evidence.name}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              You can attach screenshots, photos, PDFs, or short clips.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onNavigate("advisor")}
              className="rounded-xl active:scale-[0.98]"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="rounded-xl active:scale-[0.98]">
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2" /> Submitting…
                </>
              ) : (
                "Submit Report"
              )}
            </Button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            We’ll automatically redact personal information before an administrator reviews your report.
          </p>
        </form>
      </Card>
    </div>
  );
};

export default ReportIssuePage;
