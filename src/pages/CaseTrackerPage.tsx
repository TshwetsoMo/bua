// bua/pages/CaseTrackerPage.tsx
import React, { useState } from "react";
import type { Case, CaseStatus, User } from "../../types";
import { CaseStatus as CaseStatusEnum } from "../../types";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Textarea } from "@/components/Textarea";
import { Select } from "@/components/Select";

import { db } from "../lib/firebase/client";
import { deleteDoc, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

interface CaseTrackerPageProps {
  cases: Case[];
  currentUser: User;
}

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
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button onClick={onConfirm} disabled={loading}>{loading ? "Working..." : "Confirm"}</Button>
        </div>
      </div>
    </div>
  );
};

const CaseTrackerPage: React.FC<CaseTrackerPageProps> = ({ cases, currentUser }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNote, setEditNote] = useState(""); // appended to history
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // only show current user's cases
  const studentCases = cases
    .filter((c) => c.studentId === currentUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    // prefer description if available else redactedDescription
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

      // prepare history entry if user provided an edit note
      const historyEntry = editNote.trim()
        ? {
            id: `msg${Date.now()}`,
            sender: "Student",
            text: editNote.trim(),
            timestamp: new Date(), // client timestamp for array element
          }
        : null;

      // build new history array client-side to preserve ordering (onSnapshot listener updates UI)
      const newHistory = [
        ...(c.history?.map((h) => ({
          id: h.id,
          sender: h.sender,
          text: h.text,
          timestamp: h.timestamp instanceof Date ? h.timestamp : new Date(h.timestamp),
        })) ?? []),
        ...(historyEntry ? [historyEntry] : []),
      ];

      const updates: Record<string, any> = {
        title: editTitle,
        category: editCategory,
        description: editDescription,
        history: newHistory,
        updatedAt: serverTimestamp(), // top-level server timestamp is fine
      };

      await updateDoc(caseRef, updates);

      // clear edit state; onSnapshot will refresh the list and selected detail if any
      cancelEdit();
    } catch (err: any) {
      console.error("Failed to save case edit:", err);
      if (err?.code === "permission-denied" || String(err?.message).toLowerCase().includes("permission")) {
        setError("You don't have permission to edit this case. Only the case owner or an admin may edit.");
      } else {
        setError("Failed to save changes. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setError(null);
  };

  const doDelete = async () => {
    if (!deletingId) return;
    if (!currentUser?.id) {
      setError("You must be signed in to delete a case.");
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const caseRef = doc(db, "cases", deletingId);

      // Quick client-side ownership check for friendliness (server rules still authoritative)
      const snap = await getDoc(caseRef);
      if (!snap.exists()) {
        setError("Case not found.");
        setDeletingId(null);
        setIsDeleting(false);
        return;
      }
      const data = snap.data() as any;
      if (data.studentId !== currentUser.id) {
        // Optionally detect admin via users doc - but server will enforce admin rights.
        setError("You are not the owner of this case and cannot delete it.");
        setDeletingId(null);
        setIsDeleting(false);
        return;
      }

      await deleteDoc(caseRef);
      setDeletingId(null);
    } catch (err: any) {
      console.error("Failed to delete case:", err);
      if (err?.code === "permission-denied" || String(err?.message).toLowerCase().includes("permission")) {
        setError("You don't have permission to delete this case. Only the case owner or an admin may delete cases.");
      } else {
        setError("Failed to delete case. Please try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white text-center mb-6">My Cases</h1>

      {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

      <div className="space-y-4">
        {studentCases.length > 0 ? (
          studentCases.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <Card key={c.id}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 pr-4">
                    {isEditing ? (
                      <>
                        <Input
                          label="Title"
                          id={`title-${c.id}`}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                        <Select
                          label="Category"
                          id={`category-${c.id}`}
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
                          id={`desc-${c.id}`}
                          rows={4}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                        />
                        <Textarea
                          label="Optional note to add to history"
                          id={`note-${c.id}`}
                          rows={2}
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                        />
                        <div className="mt-3 flex gap-3">
                          <Button onClick={() => saveEdit(c)} disabled={isSaving}>
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button variant="secondary" onClick={cancelEdit} disabled={isSaving}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{c.title}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Category: {c.category} | Submitted: {new Date(c.createdAt).toLocaleDateString()}
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
                  <h3 className="font-semibold mb-2 text-slate-700 dark:text-slate-300">History</h3>
                  <ul className="space-y-2">
                    {c.history.map((h) => (
                      <li key={h.id} className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-semibold">{h.sender}:</span> {h.text}{" "}
                        <span className="text-xs italic">({new Date(h.timestamp).toLocaleString()})</span>
                      </li>
                    ))}
                  </ul>

                  {c.resolutionNote && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/50 rounded-md">
                      <h4 className="font-semibold text-green-800 dark:text-green-300">Resolution Note</h4>
                      <p className="text-sm text-green-700 dark:text-green-400">{c.resolutionNote}</p>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="text-center">
            <p className="text-slate-500 dark:text-slate-400">You have not submitted any cases yet.</p>
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
