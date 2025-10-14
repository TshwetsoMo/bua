// bua/pages/AdminConsolePage.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { Case, CaseStatus } from "../../types";
import { CaseStatus as CaseStatusEnum } from "../../types";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { Textarea } from "@/components/Textarea";

import { db } from "../lib/firebase/client";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

type FilterStatus = CaseStatus | "all";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-md z-10">
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

const AdminConsolePage: React.FC = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [newStatus, setNewStatus] = useState<CaseStatus | "">("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingUpdatePayload, setPendingUpdatePayload] = useState<{
    caseId: string;
    updates: Record<string, any>;
  } | null>(null);

  useEffect(() => {
    const q = query(collection(db, "cases"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            studentId: data.studentId,
            title: data.title,
            category: data.category,
            description: data.description,
            redactedDescription: data.redactedDescription,
            evidence: null,
            status: data.status as CaseStatus,
            history: (data.history ?? []).map((m: any) => ({
              id: m.id,
              sender: m.sender,
              text: m.text,
              timestamp: m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp),
            })),
            resolutionNote: data.resolutionNote,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          } as Case;
        });
        setCases(docs);
        setSelectedCase((prev) => {
          if (!prev) return null;
          return docs.find((c) => c.id === prev.id) ?? null;
        });
      },
      (err) => {
        console.error("Failed to listen to cases:", err);
        setError("Failed to load cases.");
      }
    );

    return () => unsub();
  }, []);

  const buildUpdates = (sc: Case | null) => {
    if (!sc) return null;

    // NOTE: serverTimestamp() is NOT allowed inside arrays. use new Date() for array element timestamps.
    const historyEntry = adminMessage.trim()
      ? {
          id: `msg${Date.now()}`,
          sender: "Admin",
          text: adminMessage.trim(),
          timestamp: new Date(), // client-side timestamp for array element
        }
      : null;

    const updates: Record<string, any> = {};

    if (newStatus) updates.status = newStatus;
    if (historyEntry) {
      updates.history = [
        ...(sc.history?.map((h) => ({
          id: h.id,
          sender: h.sender,
          text: h.text,
          timestamp: h.timestamp instanceof Date ? h.timestamp : new Date(h.timestamp),
        })) ?? []),
        historyEntry,
      ];
    }
    if (newStatus === CaseStatusEnum.Resolved && (!sc.resolutionNote || sc.resolutionNote === "")) {
      updates.resolutionNote = adminMessage.trim() || "";
    }
    return updates;
  };

  const performUpdate = async (caseId: string, updates: Record<string, any>) => {
    setError(null);
    setIsSaving(true);
    try {
      const caseRef = doc(db, "cases", caseId);
      await updateDoc(caseRef, {
        ...updates,
        updatedAt: serverTimestamp(), // OK at top-level
      });

      setAdminMessage("");
      setNewStatus("");
    } catch (err) {
      console.error("Failed to update case:", err);
      setError("Failed to update case. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateClick = () => {
    if (!selectedCase) return;
    const updates = buildUpdates(selectedCase);
    if (!updates || Object.keys(updates).length === 0) {
      return;
    }

    const targetStatus = updates.status as CaseStatus | undefined;
    if (targetStatus === CaseStatusEnum.Resolved || targetStatus === CaseStatusEnum.Closed) {
      setPendingUpdatePayload({ caseId: selectedCase.id, updates });
      setConfirmOpen(true);
      return;
    }

    performUpdate(selectedCase.id, updates);
  };

  const confirmAndPerform = async () => {
    if (!pendingUpdatePayload) return;
    setConfirmOpen(false);
    await performUpdate(pendingUpdatePayload.caseId, pendingUpdatePayload.updates);
    setPendingUpdatePayload(null);
  };

  const cancelConfirm = () => {
    setConfirmOpen(false);
    setPendingUpdatePayload(null);
  };

  const filteredCases = filterStatus === "all" ? cases : cases.filter((c) => c.status === filterStatus);

  const sortedCases = [...filteredCases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 dark:text-white text-center mb-6">Admin Console</h1>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Case Queue</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">Filter:</label>
              <Select
                id="filterStatus"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="!py-1"
              >
                <option value="all">All</option>
                {Object.values(CaseStatusEnum).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Card className="max-h-[calc(100vh-250px)] overflow-y-auto">
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {sortedCases.map((c) => (
                <li
                  key={c.id}
                  onClick={() => setSelectedCase(c)}
                  className={`p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    selectedCase?.id === c.id ? "bg-blue-50 dark:bg-blue-900/50" : ""
                  }`}
                >
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-sm text-slate-500">
                    {c.category} - {c.status}
                  </p>
                </li>
              ))}
              {sortedCases.length === 0 && (
                <li className="p-4 text-sm text-slate-500">No cases found for this filter.</li>
              )}
            </ul>
          </Card>
        </div>

        <div className="w-full md:w-2/3">
          <h2 className="text-xl font-semibold mb-4">Case Details</h2>
          {selectedCase ? (
            <Card>
              <h3 className="text-xl font-bold">{selectedCase.title}</h3>
              <p className="text-sm text-slate-500 mb-4">
                Student ID: {selectedCase.studentId} | Status: {selectedCase.status}
              </p>

              <div className="mb-4">
                <h4 className="font-semibold">Redacted Description</h4>
                <p className="text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 p-3 rounded">
                  {selectedCase.redactedDescription}
                </p>
              </div>

              <div className="space-y-4">
                {error && <p className="text-red-500 text-sm">{error}</p>}

                <Textarea
                  label="Send a message or add resolution note"
                  id="adminMessage"
                  rows={3}
                  value={adminMessage}
                  onChange={(e) => setAdminMessage(e.target.value)}
                />

                <Select
                  label="Update Status"
                  id="statusUpdate"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as CaseStatus)}
                >
                  <option value="">-- No change --</option>
                  {Object.values(CaseStatusEnum).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>

                <div className="flex items-center gap-3">
                  <Button onClick={handleUpdateClick} disabled={isSaving}>
                    {isSaving ? "Updating..." : "Update Case"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="font-semibold mb-2 text-slate-700 dark:text-slate-300">History</h3>
                <ul className="space-y-2">
                  {selectedCase.history.map((h) => (
                    <li key={h.id} className="text-sm text-slate-600 dark:text-slate-400">
                      <span className="font-semibold">{h.sender}:</span> {h.text}{" "}
                      <span className="text-xs italic">({new Date(h.timestamp).toLocaleString()})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : (
            <Card className="flex items-center justify-center h-96">
              <p className="text-slate-500">Select a case to view details.</p>
            </Card>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm status change"
        message={
          pendingUpdatePayload
            ? `You are about to change the case status to "${pendingUpdatePayload.updates.status}". This action is significant and may close the loop on the case. Are you sure you want to continue?\n\nIf you want to add a resolution note, include it in the message field before confirming.`
            : "Confirm this action?"
        }
        onConfirm={confirmAndPerform}
        onCancel={cancelConfirm}
        loading={isSaving}
      />
    </div>
  );
};

export default AdminConsolePage;
