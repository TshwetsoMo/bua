// app/api/ai/gemini/summarise/route.ts
import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

// ---- Firebase Admin init (uses your service account JSON) ----
const SA_ENV =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  "";

if (!admin.apps.length) {
  try {
    if (SA_ENV && SA_ENV.trim()) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(SA_ENV) as any),
      });
    } else {
      admin.initializeApp();
    }
    console.log("Firebase Admin initialized for summarise route.");
  } catch (e) {
    console.error("Firebase Admin init failed (summarise):", e);
  }
}

// ---- Guard: API key presence ----
if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
  console.error("[summarise] Missing GEMINI_API_KEY env var.");
}

// ---- Gemini init ----
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || undefined,
});

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Safely extract JSON from an LLM response block (first {...} object)
function extractJsonBlock(text: string): any | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// Try multiple SDK shapes to get text
function coerceOutputText(result: any): string {
  // Newer SDKs
  if (result?.response?.text && typeof result.response.text === "function") {
    try { return result.response.text(); } catch {}
  }
  if (typeof result?.output_text === "string") return result.output_text;

  // Legacy/candidates shape
  const candidateText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof candidateText === "string") return candidateText;

  // Some wrappers attach .text directly
  if (typeof result?.text === "string") return result.text;

  // Fallback: stringify
  try { return JSON.stringify(result); } catch { return String(result ?? ""); }
}

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Firebase ID token (require auth)
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!idToken) {
      return NextResponse.json({ error: "Authorization header required" }, { status: 401 });
    }

    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error("verifyIdToken failed (summarise):", err);
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401 });
    }

    // 2) Read body
    const body = await req.json().catch(() => ({}));
    const text: string = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Server configuration error (missing GEMINI_API_KEY)" },
        { status: 500 }
      );
    }

    // 3) Ask Gemini for a structured summary (JSON only)
    const prompt = `
You are an assistant helping a student report an issue to school staff.
Given the student's message below, output ONLY a JSON object (no extra text)
with the following fields:

{
  "title": string,                       // short, human-friendly title
  "category": "Academics"|"Bullying"|"Facilities"|"Policy"|"Other",
  "keyFacts": string[],                  // 3-7 short bullet points
  "description": string                  // a clear, neutral summary 3-6 sentences
}

Student message:
"""${text}"""
`;

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const outText = coerceOutputText(result);
    const parsed = extractJsonBlock(outText);

    if (!parsed) {
      return NextResponse.json(
        { error: "AI did not return valid JSON", raw: outText?.slice(0, 500) },
        { status: 502 }
      );
    }

    // Basic normalization/guards
    const categoryAllowed = ["Academics", "Bullying", "Facilities", "Policy", "Other"];
    if (!categoryAllowed.includes(parsed.category)) {
      parsed.category = "Other";
    }
    if (!Array.isArray(parsed.keyFacts)) parsed.keyFacts = [];
    if (typeof parsed.title !== "string") parsed.title = "Issue report";
    if (typeof parsed.description !== "string") parsed.description = text;

    return NextResponse.json({ summary: parsed }, { status: 200 });
  } catch (err) {
    console.error("[summarise] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
