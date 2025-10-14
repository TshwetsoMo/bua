// bua/hooks/useJournal.ts
"use client";

import { useEffect, useState } from "react";
import type { JournalEntry } from "../../types";
import { db } from "../lib/firebase/client";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

function fromFirestore(id: string, data: any): JournalEntry {
  return {
    id,
    title: data.title,
    content: data.content,
    publishedAt: data.publishedAt?.toDate?.() ?? new Date(),
    relatedCaseIds: data.relatedCaseIds ?? [],
  };
}

export const useJournal = () => {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    const q = query(collection(db, "journal"), orderBy("publishedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setJournalEntries(snap.docs.map((d) => fromFirestore(d.id, d.data())));
    });
    return () => unsub();
  }, []);

  const addJournalEntry = async (newEntry: JournalEntry) => {
    const { id: _drop, publishedAt: _ignore, ...rest } = newEntry;
    await addDoc(collection(db, "journal"), {
      ...rest,
      publishedAt: serverTimestamp(),
    });
  };

  return { journalEntries, addJournalEntry };
};
