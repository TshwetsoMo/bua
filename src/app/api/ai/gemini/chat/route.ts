// app/api/ai/gemini/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";

/**
 * Read service account JSON from one of the env vars your project uses.
 * Keep this name in sync with whatever you set in Vercel / your .env.local:
 * - FIREBASE_SERVICE_ACCOUNT_JSON
 * - FIREBASE_SERVICE_ACCOUNT
 */
const SA_ENV =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  "";

if (!SA_ENV) {
  // We throw early so the server warns loudly if env not set.
  // This file runs at module import in Next.js app routes — that's desirable so misconfig is obvious.
  console.error("FIREBASE_SERVICE_ACCOUNT JSON env var is not set.");
  // Do not throw here in production code if you prefer graceful degradation.
}

if (!admin.apps.length) {
  try {
    const parsed =
      typeof SA_ENV === "string" && SA_ENV.trim().length
        ? JSON.parse(SA_ENV)
        : undefined;

    if (parsed) {
      admin.initializeApp({
        credential: admin.credential.cert(parsed as any),
        // optionally set projectId explicit if missing: projectId: parsed.project_id
      });
    } else {
      // fall back to default credentials (if running in environment with ADC)
      admin.initializeApp();
    }
  } catch (e) {
    // If parsing failed, log full error for server-side debugging
    console.error("Failed to initialize Firebase Admin SDK:", e);
    // Let it try to initialize without cert (may still fail)
    try {
      admin.initializeApp();
    } catch (err2) {
      console.error("Fallback admin.initializeApp() also failed:", err2);
    }
  }
}

const db = admin.firestore();

// Initialize Gemini client with explicit API key if present
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || undefined,
});

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SYSTEM_INSTRUCTION =
  process.env.GEMINI_SYSTEM_PROMPT ??
  "You are Bua, a friendly school-life assistant. Keep answers concise and redact PII.";

type StoredMsg = { role: "system" | "user" | "model"; text: string; ts?: any };
const toSdkHistory = (h: StoredMsg[]) =>
  h.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.split("Bearer ")[1].trim()
      : null;

    if (!idToken) {
      return NextResponse.json({ error: "Authorization header required" }, { status: 401 });
    }

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error("verifyIdToken failed", err);
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401 });
    }
    const uid = decoded.uid;

    // 2) Parse request body
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    let chatId = typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : null;

    // If neither a message nor a chatId present — bad request
    if (!message && !chatId) {
      return NextResponse.json({ error: "message or chatId required" }, { status: 400 });
    }

    const chatsColl = db.collection("aiChats");
    let chatRef: FirebaseFirestore.DocumentReference;
    let rawHistory: StoredMsg[] = [];

    // 3) New chat: create doc with ownerUid + initial history (system + user)
    if (!chatId) {
      chatRef = chatsColl.doc();
      chatId = chatRef.id;

      rawHistory = [
        { role: "system", text: SYSTEM_INSTRUCTION, ts: admin.firestore.FieldValue.serverTimestamp() as any },
        { role: "user", text: message, ts: admin.firestore.FieldValue.serverTimestamp() as any },
      ];

      await chatRef.set({
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: rawHistory,
      });

      // If caller only wanted chat creation (edge-case), continue to call AI below
    } else {
      // 4) Existing chat: validate owner, optionally append user message
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

      rawHistory = Array.isArray(chatData.history) ? chatData.history : [];

      // If message is present (non-empty), append it; if message === "" we treat as a "fetch history" request.
      if (message) {
        rawHistory.push({ role: "user", text: message, ts: admin.firestore.FieldValue.serverTimestamp() as any });
        await chatRef.update({
          history: rawHistory,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // message is empty string -> client wants to fetch history only; return it without calling Gemini
        // Convert any firestore Timestamps to ISO strings for client (optional)
        const historyToReturn = rawHistory.map((h: any) => ({
          role: h.role,
          text: h.text,
          ts: h.ts ? (h.ts.toDate ? h.ts.toDate().toISOString() : h.ts) : null,
        }));
        return NextResponse.json({ chatId, history: historyToReturn });
      }
    }

    // 5) Convert history to SDK format and call Gemini
    try {
      const sdkHistory = toSdkHistory(rawHistory);
      const chat = ai.chats.create({ model: MODEL, history: sdkHistory });

      // If message is empty (shouldn't get here because we returned above), protect
      const reply = message ? await chat.sendMessage({ message }) : null;

      // Extract assistant text safely for different SDK shapes
      let assistantText: string | null = null;
      if (reply) {
        if (typeof reply.text === "string" && reply.text.trim()) {
          assistantText = reply.text;
        } else if (reply?.candidates && Array.isArray(reply.candidates) && reply.candidates.length) {
          // candidate content parts -> join
          const cand = reply.candidates[0];
          if (cand?.content?.[0]?.parts) {
            assistantText = cand.content[0].parts.map((p: any) => p.text).join(" ");
          } else if (cand?.content) {
            assistantText = JSON.stringify(cand.content);
          }
        } else if ((reply as any)?.output?.[0]?.content?.[0]?.text) {
          assistantText = (reply as any).output[0].content[0].text;
        } else {
          assistantText = null;
        }
      }

      if (assistantText) {
        rawHistory.push({ role: "model", text: assistantText, ts: admin.firestore.FieldValue.serverTimestamp() as any });
        // persist assistant reply
        await chatRef.update({
          history: rawHistory,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // normalize history timestamps for client readability
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


