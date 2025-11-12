// bua/pages/CaseTrackerPage.tsx
import React, { useMemo, useState } from "react";
import type { Case, CaseMessage, CaseStatus, User } from "../../types";
import { CaseStatus as CaseStatusEnum } from "../../types";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Textarea } from "@/components/Textarea";
import { Select } from "@/components/Select";

import { db } from "../lib/firebase/client";
import { deleteDoc, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

// --- Utilities ---
function asDate(v: any): Date {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "number") return new Date(v);
  return new Date(v);
}

function uniqueById<T extends { id: string }>(arr: T[] = []): T[] {
  const map = new Map<string, T>();
  for (const item of arr) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function normalizeHistory(history: CaseMessage[] = []): CaseMessage[] {
  const uniq = uniqueById(history);
  return uniq
    .map((h) => ({
      ...h,
      timestamp: asDate(h.timestamp),
    }))
    .sort((a, b) => asDate(a.timestamp).getTime() - asDate(b.timestamp).getTime());
}

// --- Confirm modal ---
const ConfirmModal: React.FC<{
  open: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}> = ({ open, title = "Confirm", message, onConfirm, onCancel, loading }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 z-10 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-2 text-slate-800 dark:text-slate-100">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Working..." : "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface CaseTrackerPageProps {
  cases: Case[];
  currentUser: User;
}

const CaseTrackerPage: React.FC<CaseTrackerPageProps> = ({ cases, currentUser }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNote, setEditNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter to current user's cases and dedupe
  const myCases = useMemo(
    () => uniqueById((cases || []).filter((c) => c.studentId === currentUser.id)),
    [cases, currentUser.id]
  );

  // Sort newest first
  const studentCases = useMemo(
    () =>
      [...myCases].sort(
        (a, b) => asDate(b.createdAt).getTime() - asDate(a.createdAt).getTime()
      ),
    [myCases]
  );

  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
      case CaseStatusEnum.Submitted:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300";
      case CaseStatusEnum.UnderReview:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300";
      case CaseStatusEnum.Resolved:
        return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
      case CaseStatusEnum.Closed:
        return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const startEdit = (c: Case) => {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditCategory(c.category);
    setEditDescription(c.description || c.redactedDescription || "");
    setEditNote("");
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditCategory("");
    setEditDescription("");
    setEditNote("");
    setError(null);
  };

  const saveEdit = async (c: Case) => {
    setError(null);
    setIsSaving(true);
    try {
      const caseRef = doc(db, "cases", c.id);

      const historyEntry = editNote.trim()
        ? {
            id: `msg${Date.now()}`,
            sender: "Student" as const,
            text: editNote.trim(),
            timestamp: new Date(),
          }
        : null;

      const currentHistory = normalizeHistory(c.history);
      const newHistory = historyEntry
        ? normalizeHistory([...currentHistory, historyEntry])
        : currentHistory;

      const updates: Record<string, any> = {
        title: editTitle,
        category: editCategory,
        description: editDescription,
        history: newHistory,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(caseRef, updates);
      cancelEdit();
    } catch (err: any) {
      console.error("Failed to save case edit:", err);
      if (err?.code === "permission-denied") {
        setError("You don't have permission to edit this case.");
      } else {
        setError("Failed to save changes. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (id: string) => setDeletingId(id);

  const doDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      const caseRef = doc(db, "cases", deletingId);
      const snap = await getDoc(caseRef);
      if (!snap.exists()) throw new Error("Case not found.");
      const data = snap.data() as any;
      if (data.studentId !== currentUser.id)
        throw new Error("You are not the owner of this case.");
      await deleteDoc(caseRef);
      setDeletingId(null);
    } catch (err: any) {
      console.error("Failed to delete case:", err);
      setError(err.message || "Failed to delete case.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white text-center mb-6">
        My Cases
      </h1>

      {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

      <div className="space-y-4">
        {studentCases.length > 0 ? (
          studentCases.map((c) => {
            const isEditing = editingId === c.id;
            const createdAt = asDate(c.createdAt);
            const safeHistory = normalizeHistory(c.history);

            return (
              <Card key={c.id}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    {isEditing ? (
                      <>
                        <Input
                          label="Title"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                        <Select
                          label="Category"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                        >
                          <option>Academics</option>
                          <option>Bullying</option>
                          <option>Facilities</option>
                          <option>Policy</option>
                          <option>Other</option>
                        </Select>
                        <Textarea
                          label="Description"
                          rows={4}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                        />
                        <Textarea
                          label="Optional note to add to history"
                          rows={2}
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                        />
                        <div className="mt-3 flex gap-3">
                          <Button onClick={() => saveEdit(c)} disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={cancelEdit}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                          {c.title}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Category: {c.category} | Submitted:{" "}
                          {createdAt.toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        c.status
                      )}`}
                    >
                      {c.status}
                    </span>

                    {!isEditing && (
                      <div className="flex gap-2">
                        <Button onClick={() => startEdit(c)}>Edit</Button>
                        <Button variant="danger" onClick={() => confirmDelete(c.id)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                  <h3 className="font-semibold mb-2 text-slate-700 dark:text-slate-300">
                    History
                  </h3>
                  <ul className="space-y-2">
                    {safeHistory.map((h) => (
                      <li key={h.id} className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-semibold">{h.sender}:</span> {h.text}{" "}
                        <span className="text-xs italic">
                          ({asDate(h.timestamp).toLocaleString()})
                        </span>
                      </li>
                    ))}
                  </ul>

                  {c.resolutionNote && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/50 rounded-md">
                      <h4 className="font-semibold text-green-800 dark:text-green-300">
                        Resolution Note
                      </h4>
                      <p className="text-sm text-green-700 dark:text-green-400">
                        {c.resolutionNote}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="text-center">
            <p className="text-slate-500 dark:text-slate-400">
              You have not submitted any cases yet.
            </p>
          </Card>
        )}
      </div>

      <ConfirmModal
        open={!!deletingId}
        title="Delete case"
        message="Are you sure you want to permanently delete this case? This action cannot be undone."
        onConfirm={doDelete}
        onCancel={() => setDeletingId(null)}
        loading={isDeleting}
      />
    </div>
  );
};

export default CaseTrackerPage;
