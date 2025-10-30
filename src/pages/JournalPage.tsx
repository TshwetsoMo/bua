// bua/pages/JournalPage.tsx
import React, { useEffect, useState } from "react";
import type { JournalEntry, Case, User } from "../../types";
import { Role as RoleEnum, CaseStatus as CaseStatusEnum } from "../../types";
import { geminiService } from "../lib/gemini";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";

import { db } from "../lib/firebase/client";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

interface JournalPageProps {
  currentUser: User;
}

// Tunables
const MAX_CASES = 2;             // ⬅️ use only the latest 2 resolved cases
const RECENT_JOURNAL_WINDOW = 2; // guard against repetition with the last 2 entries

// Helper builds anonymized, non-link evidence metadata
function buildAnonymisedEvidenceMetadata(data: any): { evidenceCount: number; evidenceTypes: string[] } {
  let count = 0;
  const types = new Set<string>();

  if (data?.evidenceUrl) {
    count += 1;
    if (data?.evidenceType) types.add(String(data.evidenceType));
    else {
      const ext = String(data.evidenceUrl).split(".").pop()?.toLowerCase() ?? "";
      if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) types.add("image");
      else if (["pdf"].includes(ext)) types.add("pdf");
      else types.add("file");
    }
  }

  if (Array.isArray(data?.evidenceUrls) && data.evidenceUrls.length) {
    count += data.evidenceUrls.length;
    data.evidenceUrls.forEach((u: string) => {
      const ext = String(u).split(".").pop()?.toLowerCase() ?? "";
      if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) types.add("image");
      else if (["pdf"].includes(ext)) types.add("pdf");
      else types.add("file");
    });
  }

  if (data?.evidence && typeof data.evidence === "object" && !Array.isArray(data.evidence)) {
    if (typeof data.evidence.count === "number") count += data.evidence.count;
    if (Array.isArray(data.evidence.types)) data.evidence.types.forEach((t: string) => types.add(t));
  }

  if (data?.evidenceType && !types.has(String(data.evidenceType))) {
    types.add(String(data.evidenceType));
    if (count === 0) count = 1;
  }

  return { evidenceCount: count, evidenceTypes: Array.from(types) };
}

// Simple normaliser to detect exact duplicates after generation
function normalise(str: string): string {
  return (str || "").trim().replace(/\s+/g, " ").toLowerCase();
}

const JournalPage: React.FC<JournalPageProps> = ({ currentUser }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "journal"), orderBy("publishedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title,
            content: data.content,
            publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate() : new Date(data.publishedAt),
            relatedCaseIds: data.relatedCaseIds ?? [],
          } as JournalEntry;
        });
        setEntries(docs);
      },
      (err) => {
        console.error("Failed to listen to journal:", err);
        setError("Failed to load journal entries.");
      }
    );

    return () => unsub();
  }, []);

  const handleGenerateJournal = async () => {
    setError(null);
    setSuccessMessage(null);

    if (currentUser.role !== RoleEnum.Admin) {
      setError("Only admins can generate journal entries.");
      return;
    }

    setIsGenerating(true);

    try {
      // 0) Load last few journal entries to avoid repetition
      const recentJournalQuery = query(
        collection(db, "journal"),
        orderBy("publishedAt", "desc"),
        limit(RECENT_JOURNAL_WINDOW)
      );
      const recentJournalSnap = await getDocs(recentJournalQuery);
      const recentJournal = recentJournalSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          content: String(data.content || ""),
          relatedCaseIds: Array.isArray(data.relatedCaseIds) ? data.relatedCaseIds.map(String) : [],
        };
      });

      const lastEntry = recentJournal[0];

      // 1) Fetch the most recent resolved cases (fetch more than needed to allow filtering)
      const casesQuery = query(
        collection(db, "cases"),
        where("status", "==", CaseStatusEnum.Resolved),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(casesQuery);

      if (snap.empty) {
        setError("No resolved cases found to summarize.");
        setIsGenerating(false);
        return;
      }

      const resolvedCasesAll: Case[] = [];
      const evidenceSummary: { caseId: string; evidenceCount: number; evidenceTypes: string[] }[] = [];

      snap.docs.forEach((d) => {
        const data = d.data() as any;

        const c: Case = {
          id: d.id,
          studentId: data.studentId ?? "redacted",
          title: data.title ?? "Untitled",
          category: data.category ?? "General",
          description: "",
          redactedDescription: data.redactedDescription ?? (data.description ? "[REDACTED]" : ""),
          evidence: null,
          status: data.status ?? CaseStatusEnum.Resolved,
          history:
            (data.history ?? []).map((m: any) => ({
              id: m.id,
              sender: m.sender,
              text: m.text,
              timestamp: m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp),
            })) ?? [],
          resolutionNote: data.resolutionNote ?? "",
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        } as Case;

        resolvedCasesAll.push(c);

        const meta = buildAnonymisedEvidenceMetadata(data);
        evidenceSummary.push({
          caseId: d.id,
          evidenceCount: meta.evidenceCount,
          evidenceTypes: meta.evidenceTypes,
        });
      });

      // 2) Avoid repetition: skip cases used in recent journal entries
      const usedRecently = new Set<string>(
        recentJournal.flatMap((j) => j.relatedCaseIds)
      );

      const uniqueRecent = resolvedCasesAll.filter((c) => !usedRecently.has(c.id));
      const picked: Case[] = uniqueRecent.slice(0, MAX_CASES);

      // If not enough, top up with newest ones (even if used), but avoid exact repeat of last set
      if (picked.length < MAX_CASES) {
        const needed = MAX_CASES - picked.length;
        const topUp = resolvedCasesAll
          .filter((c) => !picked.find((p) => p.id === c.id))
          .slice(0, needed);
        picked.push(...topUp);
      }

      if (picked.length === 0) {
        setError("No new cases to summarise for the journal right now.");
        setIsGenerating(false);
        return;
      }

      // Guard: if picked cases equal the last entry's relatedCaseIds, abort
      if (lastEntry) {
        const lastSet = new Set(lastEntry.relatedCaseIds);
        const pickedSet = new Set(picked.map((c) => c.id));
        const sameSize = lastSet.size === pickedSet.size;
        const sameMembers = sameSize && [...pickedSet].every((id) => lastSet.has(id));
        if (sameMembers) {
          setError("New journal would repeat the same set of cases as the last entry. Try later when new cases are available.");
          setIsGenerating(false);
          return;
        }
      }

      // 3) Summarise (only pass anonymised fields)
      const summary = await geminiService.summariseCasesForJournal(
        picked.map((c) => ({
          id: c.id,
          category: c.category,
          redactedDescription: c.redactedDescription || "",
        }))
      );

      // Post-gen duplicate content guard
      if (lastEntry && normalise(summary) === normalise(lastEntry.content)) {
        setError("Generated journal is too similar to the previous one. Please try again later when new cases arrive.");
        setIsGenerating(false);
        return;
      }

      // 4) Save journal entry
      const title = `News Update - ${new Date().toLocaleDateString()}`;
      const newDoc = {
        title,
        content: summary,
        relatedCaseIds: picked.map((c) => c.id),
        evidenceSummary: evidenceSummary.filter((e) => picked.some((c) => c.id === e.caseId)),
        publishedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "journal"), newDoc);
      setSuccessMessage("Journal entry generated successfully (anonymised, recent cases).");
    } catch (err) {
      console.error("Error generating journal entry:", err);
      setError("Failed to generate journal entry. Please try again.");
    } finally {
      setIsGenerating(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white text-center sm:text-left">
          Anonymised News Feed
        </h1>

        {currentUser.role === RoleEnum.Admin && (
          <Button onClick={handleGenerateJournal} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Spinner className="mr-2" /> Generating...
              </>
            ) : (
              "Generate New Entry from Cases"
            )}
          </Button>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {successMessage && <p className="text-green-600 text-sm mb-4">{successMessage}</p>}

      <div className="space-y-6">
        {sortedEntries.map((entry) => (
          <Card key={entry.id}>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">{entry.title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Published on {new Date(entry.publishedAt).toLocaleDateString()}
            </p>
            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{entry.content}</p>
          </Card>
        ))}

        {sortedEntries.length === 0 && (
          <Card>
            <p className="text-slate-500">No journal entries yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default JournalPage;

