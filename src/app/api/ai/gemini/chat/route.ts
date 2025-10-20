import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Firebase Admin init (using FIREBASE_SERVICE_ACCOUNT_JSON) ---
(function initAdmin() {
  if (admin.apps.length) return;
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (sa) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa) as any) });
      console.log("[chat] Firebase Admin initialized.");
    } else {
      console.error("[chat] Missing FIREBASE_SERVICE_ACCOUNT_JSON; falling back to ADC.");
      admin.initializeApp();
    }
  } catch (e) {
    console.error("[chat] Firebase Admin init failed:", e);
    try { admin.initializeApp(); } catch (e2) { console.error("[chat] Fallback init failed:", e2); }
  }
})();

const db = admin.firestore();

// --- Gemini ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || undefined });
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SYSTEM_INSTRUCTION =
  process.env.GEMINI_SYSTEM_PROMPT ??
  "You are Bua, a friendly school-life assistant. Keep answers concise and redact PII.";

// Only store user/model in history
type StoredMsg = { role: "user" | "model"; text: string; ts?: any };

// Build contents for generateContent (prepend system as guidance ‘user’ turn)
function buildContents(systemText: string, history: StoredMsg[]) {
  return [
    { role: "user", parts: [{ text: systemText }] },
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
  ];
}

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    if (!idToken) return NextResponse.json({ error: "Authorization header required" }, { status: 401 });

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error("[chat] verifyIdToken failed:", err);
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401 });
    }
    const uid = decoded.uid;

    // 2) Parse body
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    let chatId = typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : null;
    if (!message && !chatId) return NextResponse.json({ error: "message or chatId required" }, { status: 400 });

    const chatsColl = db.collection("aiChats");
    let chatRef: FirebaseFirestore.DocumentReference;
    let history: StoredMsg[] = [];

    // 3) New chat
    if (!chatId) {
      chatRef = chatsColl.doc();
      chatId = chatRef.id;

      // ✅ Use a concrete Timestamp for array items
      history = [
        { role: "user", text: message, ts: admin.firestore.Timestamp.now() },
      ];

      await chatRef.set({
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), // ok (top-level)
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), // ok (top-level)
        history, // contains concrete Timestamps, not FieldValue
      });
    } else {
      // 4) Existing chat
      chatRef = chatsColl.doc(chatId);
      const snap = await chatRef.get();
      if (!snap.exists) return NextResponse.json({ error: "chat not found" }, { status: 404 });
      const data = snap.data();
      if (!data) return NextResponse.json({ error: "chat data missing" }, { status: 500 });
      if (data.ownerUid !== uid) return NextResponse.json({ error: "Not authorized for this chat" }, { status: 403 });

      history = Array.isArray(data.history) ? data.history : [];

      // Resume (empty message): return history and exit
      if (!message) {
        const out = history.map((h: any) => ({
          role: h.role, text: h.text,
          ts: h.ts ? (h.ts.toDate ? h.ts.toDate().toISOString() : h.ts) : null,
        }));
        return NextResponse.json({ chatId, history: out });
      }

      // Append new user message with concrete timestamp
      history.push({ role: "user", text: message, ts: admin.firestore.Timestamp.now() });
      await chatRef.update({
        history,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 5) Call Gemini
    const contents = buildContents(SYSTEM_INSTRUCTION, history);

    let assistantText: string | null = null;
    try {
      const result = await ai.models.generateContent({ model: MODEL, contents });
      if (result?.response?.text) assistantText = result.response.text();
      else if (typeof (result as any)?.text === "string") assistantText = (result as any).text;
      else assistantText = null;
    } catch (e: any) {
      console.error("[chat] Gemini call failed:", e?.message || e);
      return NextResponse.json({ error: "Failed to get response from AI." }, { status: 502 });
    }

    // 6) Save assistant reply (with concrete timestamp) and return
    if (assistantText && assistantText.trim()) {
      history.push({ role: "model", text: assistantText, ts: admin.firestore.Timestamp.now() });
      await chatRef.update({
        history,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const out = history.map((h: any) => ({
      role: h.role, text: h.text,
      ts: h.ts ? (h.ts.toDate ? h.ts.toDate().toISOString() : h.ts) : null,
    }));

    return NextResponse.json({ chatId, text: assistantText, history: out });
  } catch (err: any) {
    console.error("[chat] unexpected server error:", err?.message || err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


