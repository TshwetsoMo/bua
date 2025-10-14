// bua/hooks/useCase.ts
"use client";

import { useEffect, useState } from "react";
import type { Case, User } from "../../types";
import { Role } from "../../types";
import { db } from "../lib/firebase/client";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";


function fromFirestore(id: string, data: any): Case {
  return {
    id,
    studentId: data.studentId,
    title: data.title,
    category: data.category,
    description: data.description,
    redactedDescription: data.redactedDescription,
    evidence: null, 
    status: data.status,
    history: (data.history ?? []).map((m: any) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp?.toDate?.() ?? new Date(m.timestamp),
    })),
    resolutionNote: data.resolutionNote,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
  };
}

export const useCases = (currentUser: User | null) => {
  const [cases, setCases] = useState<Case[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setCases([]);
      return;
    }

    const base = collection(db, "cases");
    const q =
      currentUser.role === Role.Admin
        ? query(base, orderBy("createdAt", "desc"))
        : query(base, where("studentId", "==", currentUser.id), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      setCases(snap.docs.map((d) => fromFirestore(d.id, d.data())));
    });

    return () => unsub();
  }, [currentUser]);

  const addCase = async (newCase: Case) => {
    
    const { id: _drop, evidence: _file, history, createdAt, ...rest } = newCase;
    const ref = await addDoc(collection(db, "cases"), {
      ...rest,
      history: (history ?? []).map((m) => ({
        ...m,
        timestamp: m.timestamp ? new Date(m.timestamp) : serverTimestamp(),
      })),
      createdAt: serverTimestamp(),
    });
    
    return ref.id;
  };

  const updateCase = async (updatedCase: Case) => {
    const { id, evidence: _file, ...rest } = updatedCase;
    await updateDoc(doc(db, "cases", id), {
      ...rest,
      
    });
  };

  return { cases, addCase, updateCase };
};
