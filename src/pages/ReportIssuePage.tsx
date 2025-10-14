// bua/pages/ReportIssuePage.tsx
import React, { useState } from "react";
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
  addCase?: (c: Case) => Promise<void>;
}

const ReportIssuePage: React.FC<ReportIssuePageProps> = ({ onNavigate, context, currentUser, addCase }) => {
  const [category, setCategory] = useState("Academics");
  const [description, setDescription] = useState(context?.prefill || "");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // redact PII
      const redactedDescription = await geminiService.redactPII(description);

      // upload evidence (if any)
      let evidenceUrl: string | null = null;
      let evidenceType: string | null = null;
      if (evidence) {
        const fileNameSafe = `${Date.now()}_${(evidence.name || "evidence").replace(/\s+/g, "_")}`;
        const sRef = storageRef(storage, `evidence/${currentUser.id}/${fileNameSafe}`);
        await uploadBytes(sRef, evidence);
        evidenceUrl = await getDownloadURL(sRef);
        evidenceType = guessEvidenceType(evidence);
      }

      // prepare payload: use client-side Date() for history timestamps (serverTimestamp() can't go inside arrays)
      const now = new Date();
      const casePayload: any = {
        studentId: currentUser.id,
        title: description.length > 60 ? description.slice(0, 60) + "..." : description,
        category,
        description,
        redactedDescription,
        status: CaseStatusEnum.Submitted,
        history: [
          {
            id: `msg${Date.now()}`,
            sender: "Student",
            text: "Case submitted.",
            timestamp: now, // <-- client Date()
          },
        ],
        createdAt: serverTimestamp(), // top-level server timestamp is OK
        resolutionNote: "",
      };

      if (evidenceUrl) {
        casePayload.evidenceUrl = evidenceUrl;
        casePayload.evidenceType = evidenceType;
        casePayload.evidence = { count: 1, type: evidenceType };
      }

      const docRef = await addDoc(collection(db, "cases"), casePayload);

      // optionally inform parent local state
      if (addCase) {
        const createdCase: Case = {
          id: docRef.id,
          studentId: currentUser.id,
          title: casePayload.title,
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
        } catch (_) {
          // ignore if parent can't handle it
        }
      }

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
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white text-center mb-6">Report an Issue</h1>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your report will be reviewed by an administrator. Personal information will be redacted by our AI assistant to protect your privacy before an admin sees it.
          </p>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <Select label="Category" id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>Academics</option>
            <option>Bullying</option>
            <option>Facilities</option>
            <option>Policy</option>
            <option>Other</option>
          </Select>

          <Textarea
            label="Describe the issue"
            id="description"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <Input
            label="Upload evidence (optional)"
            id="evidence"
            type="file"
            onChange={(e) => setEvidence(e.target.files ? e.target.files[0] : null)}
          />

          <div className="flex justify-end gap-4">
            <Button type="button" variant="secondary" onClick={() => onNavigate("advisor")}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Spinner className="mr-2" /> Submitting...</> : "Submit Report"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default ReportIssuePage;
