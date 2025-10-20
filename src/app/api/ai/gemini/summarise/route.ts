// app/api/ai/gemini/summarize/route.ts
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
    console.log("Firebase Admin initialized for summarize route.");
  } catch (e) {
    console.error("Firebase Admin init failed (summarize):", e);
  }
}

// ---- Gemini init ----
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || undefined,
});

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Small helper to safely pull JSON out of an LLM response
function extractJsonBlock(text: string): any | null {
  // Try to find the first {...} JSON object in the output
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
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
      console.error("verifyIdToken failed (summarize):", err);
      return NextResponse.json({ error: "Invalid or expired ID token" }, { status: 401 });
    }

    // 2) Read body
    const body = await req.json().catch(() => ({}));
    const text: string = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
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

    // Use the models.generateContent API (keeps us away from "system" role issues)
    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    // Robustly extract text
    let outText = "";
    if (typeof (result as any)?.text === "string") {
      outText = (result as any).text;
    } else if ((result as any)?.candidates?.[0]?.content?.parts?.[0]?.text) {
      outText = (result as any).candidates[0].content.parts[0].text;
    } else {
      outText = JSON.stringify((result as any), null, 2);
    }

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

    return NextResponse.json({ summary: parsed });
  } catch (err) {
    console.error("[summarize] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
