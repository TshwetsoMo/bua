// app/api/ai/gemini/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";

// Initialize Firebase Admin SDK
if (!admin.apps?.length) {
  try {
    admin.initializeApp();
  } catch (e) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const sa = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
      });
    } else {
      admin.initializeApp();
    }
  }
}

const db = admin.firestore();
const ai = new GoogleGenAI({});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SYSTEM_INSTRUCTION =
  process.env.GEMINI_SYSTEM_PROMPT ??
  "You are Bua, a friendly school-life assistant. Keep answers concise and redact PII.";

type StoredMsg = { role: "system" | "user" | "model"; text: string; ts?: any };
const toSdkHistory = (h: StoredMsg[]) =>
  h.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

export async function POST(req: NextRequest) {
  try {
    // Verify Firebase ID token
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.split("Bearer ")[1].trim()
      : null;
    if (!idToken) return NextResponse.json({ error: "Authorization header required" }, { status: 401 });

    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error("verifyIdToken failed", err);
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401 });
    }
    const uid = decoded.uid;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    let chatId = typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : null;

    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    const chatsColl = db.collection("aiChats");
    let rawHistory: StoredMsg[] = [];
    let chatRef: FirebaseFirestore.DocumentReference;

    // Handle new chat
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
    } else {
      // Handle existing chat
      chatRef = chatsColl.doc(chatId);
      const chatSnap = await chatRef.get();
      if (!chatSnap.exists) return NextResponse.json({ error: "chat not found" }, { status: 404 });

      const chatData = chatSnap.data() as any;
      if (chatData.ownerUid !== uid) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

      rawHistory = Array.isArray(chatData.history) ? chatData.history : [];
      rawHistory.push({ role: "user", text: message, ts: admin.firestore.FieldValue.serverTimestamp() as any });

      await chatRef.update({ history: rawHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    // Send message to Gemini
    const sdkHistory = toSdkHistory(rawHistory);
    const chat = ai.chats.create({ model: MODEL, history: sdkHistory });
    const reply = await chat.sendMessage({ message });

    // Extract assistant text safely
    const assistantText =
      reply?.text ??
      (reply?.candidates && reply.candidates[0]?.content?.parts
        ? reply.candidates[0].content.parts.map((p) => p.text).join(" ")
        : "No response received.");

    // Append assistant reply to Firestore
    rawHistory.push({ role: "model", text: assistantText, ts: admin.firestore.FieldValue.serverTimestamp() as any });
    await chatRef.update({ history: rawHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Return response to client
    return NextResponse.json({ chatId, text: assistantText });
  } catch (err: any) {
    console.error("[/api/ai/gemini/chat] error:", err);
    return NextResponse.json({ error: "Failed to handle chat message" }, { status: 500 });
  }
}


