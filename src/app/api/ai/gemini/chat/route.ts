// app/api/ai/gemini/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";

//
// Initialize Firebase Admin using FIREBASE_SERVICE_ACCOUNT_JSON only.
// This function throws/logs if parsing fails — route will return useful errors.
//
function initAdminFromJsonEnv() {
  if (admin.apps?.length) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON not set in environment.");
    // Try to initialize default (will likely fail verifyIdToken but we still attempt)
    try {
      admin.initializeApp();
      console.warn("Initialized default admin app (no service account provided). verifyIdToken may fail.");
    } catch (e) {
      console.error("admin.initializeApp() failed (no service account):", e);
    }
    return;
  }

  try {
    // Replace escaped newlines with real newlines (common when storing JSON in env)
    const fixed = raw.replace(/\\n/g, "\n");
    const sa = JSON.parse(fixed);

    // If project_id missing, try to set from env var (optional)
    if (!sa.project_id && process.env.GCP_PROJECT) {
      sa.project_id = process.env.GCP_PROJECT;
    }

    admin.initializeApp({
      credential: admin.credential.cert(sa),
      // no databaseURL required for Firestore usage
    });

    console.log("Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON.");
  } catch (err) {
    console.error("Failed to initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT_JSON:", err);
    // fallback to default attempt
    try {
      admin.initializeApp();
      console.warn("Fell back to default admin.initializeApp(). verifyIdToken may fail.");
    } catch (e) {
      console.error("Fallback admin.initializeApp() also failed:", e);
    }
  }
}

initAdminFromJsonEnv();

// Firestore & Gemini client
const db = admin.firestore();

// Create Gemini client. Prefer explicit API key if provided.
const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : new GoogleGenAI({});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SYSTEM_INSTRUCTION =
  process.env.GEMINI_SYSTEM_PROMPT ??
  "You are Bua, a friendly school-life assistant. Keep answers concise and redact PII.";

// Stored message shape in Firestore
type StoredMsg = { role: "system" | "user" | "model"; text: string; ts?: any };

// Convert Firestore-stored history to the SDK chat history shape
const toSdkHistory = (h: StoredMsg[]) => h.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

export async function POST(req: NextRequest) {
  try {
    // --- 1) Authorization: require a Firebase ID token in Authorization header
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1].trim() : null;
    if (!idToken) {
      return NextResponse.json({ error: "Authorization header required" }, { status: 401 });
    }

    // Verify ID token (may fail if Admin SDK not configured correctly)
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error("verifyIdToken failed:", err);
      // provide safe message to client
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401 });
    }
    const uid = decoded.uid;

    // --- 2) Parse request body
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    let chatId = typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : null;

    // Require at least a message or chatId
    if (!message && !chatId) {
      return NextResponse.json({ error: "message or chatId required" }, { status: 400 });
    }

    const chatsColl = db.collection("aiChats");
    let rawHistory: StoredMsg[] = [];
    let chatRef: FirebaseFirestore.DocumentReference;

    // --- 3) New chat: create doc with ownerUid and initial history
    if (!chatId) {
      chatRef = chatsColl.doc();
      chatId = chatRef.id;

      rawHistory = [{ role: "system", text: SYSTEM_INSTRUCTION, ts: admin.firestore.FieldValue.serverTimestamp() as any }];
      if (message) {
        rawHistory.push({ role: "user", text: message, ts: admin.firestore.FieldValue.serverTimestamp() as any });
      }

      await chatRef.set({
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        history: rawHistory,
      });
    } else {
      // --- 4) Existing chat: validate ownership, append user message (if present)
      chatRef = chatsColl.doc(chatId);
      const chatSnap = await chatRef.get();
      if (!chatSnap.exists) return NextResponse.json({ error: "chat not found" }, { status: 404 });

      const chatData = chatSnap.data();
      if (!chatData) return NextResponse.json({ error: "chat data missing" }, { status: 500 });

      if (chatData.ownerUid !== uid) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

      rawHistory = Array.isArray(chatData.history) ? chatData.history : [];
      if (message) {
        rawHistory = [...rawHistory, { role: "user", text: message, ts: admin.firestore.FieldValue.serverTimestamp() as any }];
        await chatRef.update({ history: rawHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }

    // --- 5) Call Gemini (chat SDK) with history
    const sdkHistory = toSdkHistory(rawHistory);

    // sanity check: ai client existence
    if (!ai) {
      return NextResponse.json({ error: "AI client is not configured" }, { status: 500 });
    }

    const chat = ai.chats.create({ model: MODEL, history: sdkHistory });

    // If client asked only to fetch history (no message), skip call
    let assistantText: string | null = null;
    if (message) {
      const reply = await chat.sendMessage({ message });

      // Extract text safely (SDK shapes vary across versions)
      assistantText =
        (reply && (reply.text ?? null)) ??
        (reply?.candidates && reply.candidates[0]?.content?.parts
          ? reply.candidates[0].content.parts.map((p: any) => p.text).join(" ")
          : null) ??
        null;

      if (assistantText) {
        rawHistory = [...rawHistory, { role: "model", text: assistantText, ts: admin.firestore.FieldValue.serverTimestamp() as any }];
        await chatRef.update({ history: rawHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }

    // --- 6) Return chatId, assistant text (if any), and the current history
    return NextResponse.json({ chatId, text: assistantText, history: rawHistory });
  } catch (err: any) {
    console.error("[/api/ai/gemini/chat] error:", err);
    return NextResponse.json({ error: "Failed to handle chat message" }, { status: 500 });
  }
}




