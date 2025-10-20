// app/api/ai/gemini/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";

/**
 * Configured env names in your project:
 * - FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT (JSON string)
 * - GEMINI_API_KEY
 * - GEMINI_MODEL (optional)
 *
 * This route:
 * - verifies Firebase ID tokens (admin SDK initialized from service account JSON)
 * - stores/reads chat docs in Firestore collection "aiChats" with ownerUid
 * - appends user & model messages to the chat history
 * - calls Gemini via the SDK (ai.chats.create / .sendMessage)
 *
 * IMPORTANT: the SDK chat history used here only contains roles "user" and "model".
 * The previous error came from passing role "system" — the SDK rejected it.
 */

const SA_ENV =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  "";

if (!admin.apps.length) {
  try {
    const parsed =
      typeof SA_ENV === "string" && SA_ENV.trim().length ? JSON.parse(SA_ENV) : undefined;

    if (parsed) {
      admin.initializeApp({
        credential: admin.credential.cert(parsed as any),
      });
      console.info("Firebase Admin initialized with provided service account JSON.");
    } else {
      // fallback to default credentials (ADC) — may work in some environments
      admin.initializeApp();
      console.info("Firebase Admin initialized with default credentials (no service account JSON).");
    }
  } catch (initErr) {
    console.error("Failed to initialize Firebase Admin SDK with provided service account:", initErr);
    try {
      admin.initializeApp();
      console.info("Firebase Admin fallback initializeApp() succeeded.");
    } catch (fallbackErr) {
      console.error("Firebase Admin fallback initializeApp() failed:", fallbackErr);
    }
  }
}

const db = admin.firestore();

// Initialize Gemini client explicitly with API key if provided
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || undefined,
});

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// Keep your system instruction string handy — we DO NOT put it in history with role "system"
// because the chat SDK enforces 'user'|'model' roles.
const SYSTEM_INSTRUCTION =
  process.env.GEMINI_SYSTEM_PROMPT ??
  "You are Bua, a friendly school-life assistant. Keep answers concise and redact PII.";

/** Local representation persisted in Firestore */
type StoredMsg = { role: "user" | "model"; text: string; ts?: any };

/** Convert stored history to SDK chat history (only user/model roles) */
const toSdkHistory = (h: StoredMsg[]) => h.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1].trim() : null;

    if (!idToken) {
      return NextResponse.json({ error: "Authorization header required" }, { status: 401 });
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (verifyErr) {
      console.error("verifyIdToken failed", verifyErr);
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401 });
    }
    const uid = decoded.uid;

    // 2) Parse body
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    let chatId = typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : null;

    // if neither provided, bad request
    if (!message && !chatId) {
      return NextResponse.json({ error: "message or chatId required" }, { status: 400 });
    }

    const chatsColl = db.collection("aiChats");
    let chatRef: FirebaseFirestore.DocumentReference;
    let rawHistory: StoredMsg[] = [];

    // 3) Create new chat (no 'system' role written into stored history; we persist only user/model)
    if (!chatId) {
      chatRef = chatsColl.doc();
      chatId = chatRef.id;

      rawHistory = [
        // only store user and model roles. We'll not store a system role here to avoid the SDK error.
        { role: "user", text: message, ts: admin.firestore.FieldValue.serverTimestamp() as any },
      ];

      await chatRef.set({
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: rawHistory,
      });
    } else {
      // 4) Existing chat: validate ownership and optionally append user message
      chatRef = chatsColl.doc(chatId);
      const chatSnap = await chatRef.get();
      if (!chatSnap.exists) {
        return NextResponse.json({ error: "chat not found" }, { status: 404 });
      }
      const chatData = chatSnap.data();
      if (!chatData) {
        return NextResponse.json({ error: "chat data missing" }, { status: 500 });
      }
      if (chatData.ownerUid !== uid) {
        return NextResponse.json({ error: "Not authorized for this chat" }, { status: 403 });
      }

      rawHistory = Array.isArray(chatData.history) ? (chatData.history as StoredMsg[]) : [];

      // If message empty string => client asked to fetch history only (resume). Return now.
      if (!message) {
        const historyToReturn = rawHistory.map((h: any) => ({
          role: h.role,
          text: h.text,
          ts: h.ts ? (h.ts.toDate ? h.ts.toDate().toISOString() : h.ts) : null,
        }));
        return NextResponse.json({ chatId, history: historyToReturn });
      }

      // append user message
      rawHistory.push({ role: "user", text: message, ts: admin.firestore.FieldValue.serverTimestamp() as any });
      await chatRef.update({ history: rawHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // 5) Call Gemini — we will create the chat with only user/model roles.
    //    To supply a system instruction you could either:
    //      - include it inside the first user message (less ideal), or
    //      - call the lower-level models.generateContent with config.systemInstruction (not implemented here),
    //    For now, we'll pass history without a system role to avoid SDK validation error.
    try {
      const sdkHistory = toSdkHistory(rawHistory);

      // create chat
      const chat = ai.chats.create({
        model: MODEL,
        history: sdkHistory,
      });

      // send the new user message (sendMessage will use the provided history + appended message)
      const reply = await chat.sendMessage({ message });

      // Defensive extraction of assistant text: SDK shapes vary across versions.
      let assistantText: string | null = null;

      // 1) reply.text (most convenient)
      if (reply && typeof reply.text === "string" && reply.text.trim()) {
        assistantText = reply.text;
      }

      // 2) reply.candidates[0].content[...] -> parts -> text
      if (!assistantText && reply && Array.isArray((reply as any).candidates) && (reply as any).candidates.length > 0) {
        const cand = (reply as any).candidates[0];
        // cand.content may be structured differently; check defensively
        if (Array.isArray(cand.content)) {
          // find first element that has parts array
          const contentElem = cand.content.find((c: any) => Array.isArray(c?.parts));
          if (contentElem && Array.isArray(contentElem.parts)) {
            assistantText = contentElem.parts.map((p: any) => p?.text ?? "").join(" ").trim();
          }
        } else if (Array.isArray(cand?.content?.parts)) {
          assistantText = cand.content.parts.map((p: any) => p?.text ?? "").join(" ").trim();
        } else if (typeof cand.content === "string") {
          assistantText = cand.content;
        }
      }

      // 3) reply.output[0].content[0].text (older or alternate SDK shape)
      if (!assistantText && reply && Array.isArray((reply as any).output) && (reply as any).output.length > 0) {
        const output0 = (reply as any).output[0];
        if (output0 && Array.isArray(output0.content) && output0.content.length > 0) {
          const c0 = output0.content[0];
          if (c0 && typeof c0.text === "string" && c0.text.trim()) {
            assistantText = c0.text;
          }
        }
      }

      // fallback to JSON-stringifying the reply for debugging
      if (!assistantText && reply) {
        assistantText = JSON.stringify(reply).slice(0, 2000); // avoid huge payloads
      }

      // persist assistant reply to Firestore history
      if (assistantText) {
        rawHistory.push({ role: "model", text: assistantText, ts: admin.firestore.FieldValue.serverTimestamp() as any });
        await chatRef.update({ history: rawHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }

      // normalize timestamps for client readability
      const historyToReturn = rawHistory.map((h: any) => ({
        role: h.role,
        text: h.text,
        ts: h.ts ? (h.ts.toDate ? h.ts.toDate().toISOString() : h.ts) : null,
      }));

      return NextResponse.json({ chatId, text: assistantText, history: historyToReturn });
    } catch (aiErr) {
      console.error("Gemini / AI call failed:", aiErr);
      return NextResponse.json({ error: "Failed to get response from AI." }, { status: 502 });
    }
  } catch (err: any) {
    console.error("[/api/ai/gemini/chat] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
