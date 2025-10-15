import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SYSTEM_INSTRUCTION = process.env.GEMINI_SYSTEM_PROMPT ?? "You are Bua...";

export async function POST(req: NextRequest) {
  try {
    // Expect: { history: [ { role: 'user'|'model', text: '...' }, ... ] }
    // Or: { message: '...' } as a single-turn append to an implied session
    const body = await req.json();

    // If the client provides `history` array, convert; otherwise create a chat with user message
    if (Array.isArray(body.history)) {
      // Create a chat with the supplied history for multi-turn
      const chat = ai.chats.create({
        model: MODEL,
        history: body.history.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
      });

      // Option A: send new message via chat.sendMessage
      if (body.message) {
        const reply = await chat.sendMessage({ message: body.message });
        return NextResponse.json({ text: reply.text });
      } else {
        // No new message, just return a small ack or the last message
        return NextResponse.json({ text: "Chat session created" });
      }
    } else if (typeof body.message === "string") {
      // Simpler API: create chat with system + user, then send message in one go
      const chat = ai.chats.create({
        model: MODEL,
        history: [
          { role: "system", parts: [{ text: SYSTEM_INSTRUCTION }] },
          { role: "user", parts: [{ text: body.message }] },
        ],
      });

      const response = await chat.sendMessage({ message: body.message });
      return NextResponse.json({ text: response.text });
    } else {
      return NextResponse.json({ error: "message or history required" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[/api/ai/gemini/chat] error:", err);
    return NextResponse.json({ error: "AI error" }, { status: 500 });
  }
}

