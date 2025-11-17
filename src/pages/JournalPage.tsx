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

// ⬇️ Markdown rendering
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

interface JournalPageProps {
  currentUser: User;
}

// Tunables
const MAX_CASES = 2;             // use only the latest 2 resolved cases
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

// Normalisers & similarity
function normalise(str: string): string {
  return (str || "").trim().replace(/\s+/g, " ").toLowerCase();
}
function jaccardSimilarity(a: string, b: string): number {
  const A = new Set(normalise(a).split(/\W+/).filter(Boolean));
  const B = new Set(normalise(b).split(/\W+/).filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** ──────────────────────────────────────────────────────────────
 * Markdown helpers
 *  - Converts inline "• item; • item" into proper vertical lists
 *  - Normalises numbered items like "1) " -> "1. "
 *  - Keeps paragraphs and soft line breaks readable
 * ────────────────────────────────────────────────────────────── */
function toMarkdownFriendly(text: string): string {
  if (!text) return "";

  let t = String(text).replace(/\r\n/g, "\n").trim();

  // If a colon is followed by bullets on the same line, make a newline before bullets.
  // e.g., "Immediate considerations: • do X; • do Y." -> "Immediate considerations:\n- do X\n- do Y"
  t = t.replace(/:\s*•\s*/g, ":\n- ");

  // Any remaining inline bullets -> break to their own lines as list items
  // e.g., "… gaps. • audit blocks; • issue circular." -> "\n- audit blocks\n- issue circular"
  t = t.replace(/\s*•\s*/g, "\n- ");

  // Normalise list markers that begin a line: "•", "▪", "–", "—", "-" -> "- "
  t = t.replace(/^(?:\s*[•▪◦·\-–—]\s+)/gm, "- ");

  // Numbered bullets "1) something" -> "1. something"
  t = t.replace(/(^|\n)\s*(\d+)\)\s+/g, "$1$2. ");

  // Collapse 3+ blank lines to max 2
  t = t.replace(/\n{3,}/g, "\n\n");

  return t;
}

/** Small renderer for News/Journal Markdown */
const JournalMarkdown: React.FC<{ children: string }> = ({ children }) => {
  const content = toMarkdownFriendly(children);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        p: ({ node, ...props }) => (
          <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
        ),
        strong: ({ node, ...props }) => <strong {...props} />,
        em: ({ node, ...props }) => <em {...props} />,
        ul: ({ node, ...props }) => (
          <ul className="list-disc pl-5 my-2 space-y-1" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />
        ),
        li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
        a: ({ node, ...props }) => (
          <a
            className="underline decoration-blue-500 hover:decoration-blue-700"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        code: ({ inline, children, ...props }) =>
          inline ? (
            <code
              className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 text-sm"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code {...props}>{children}</code>
          ),
        pre: ({ node, ...props }) => (
          <pre
            className="my-2 max-w-full overflow-x-auto rounded-md bg-slate-900 text-slate-100 p-3 text-sm"
            {...props}
          />
        ),
        h1: ({ node, ...props }) => <h1 className="text-lg font-bold mb-2" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-base font-bold mb-2" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-base font-semibold mb-2" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

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
      setError("Only admins can generate news entries.");
      return;
    }

    setIsGenerating(true);

    try {
      // 0) Load last few news entries to avoid repetition
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

      // 1) Fetch the most recent resolved cases (get more to allow filtering)
      const casesQuery = query(
        collection(db, "cases"),
        where("status", "==", CaseStatusEnum.Resolved),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(casesQuery);

      if (snap.empty) {
        setError("No resolved cases found to summarise.");
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

      // 2) Avoid repetition: skip cases already used in recent entries
      const usedRecently = new Set<string>(recentJournal.flatMap((j) => j.relatedCaseIds));
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
        setError("No new cases to summarise for the news feed right now.");
        setIsGenerating(false);
        return;
      }

      // Guard: if picked cases equal the last entry's relatedCaseIds, we still allow,
      // but only block if the generated text is almost identical (>0.98 Jaccard)
      const pickedIds = picked.map((c) => c.id);
      const sameAsLast =
        !!lastEntry &&
        lastEntry.relatedCaseIds.length === pickedIds.length &&
        pickedIds.every((id) => lastEntry.relatedCaseIds.includes(id));

      // 3) Summarise (only pass anonymised fields)
      const summary = await geminiService.summariseCasesForJournal(
        picked.map((c) => ({
          id: c.id,
          category: c.category,
          redactedDescription: c.redactedDescription || "",
        }))
      );

      // 4) Post-gen duplicate content guard (only block if same case set AND text ~identical)
      if (lastEntry && sameAsLast) {
        const sim = jaccardSimilarity(summary, lastEntry.content);
        if (sim >= 0.98) {
          setError(
            "Generated news looks too similar to the previous one for the same cases. Try again after new cases arrive."
          );
          setIsGenerating(false);
          return;
        }
      }

      // 5) Save news entry
      const title = `News Update - ${new Date().toLocaleDateString()}`;
      const newDoc = {
        title,
        content: summary,
        relatedCaseIds: pickedIds,
        evidenceSummary: evidenceSummary.filter((e) => pickedIds.includes(e.caseId)),
        publishedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "journal"), newDoc);
      setSuccessMessage("News entry generated successfully (anonymised, recent cases).");
    } catch (err) {
      console.error("Error generating news entry:", err);
      setError("Failed to generate news entry. Please try again.");
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

            {/* Proper Markdown rendering with bullet normalisation */}
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <JournalMarkdown>{entry.content}</JournalMarkdown>
            </div>
          </Card>
        ))}

        {sortedEntries.length === 0 && (
          <Card>
            <p className="text-slate-500">No entries yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default JournalPage;
