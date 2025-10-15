// app/api/ai/advice/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt || '').trim();
    if (!prompt || prompt.length < 2) {
      return NextResponse.json({ error: 'Prompt is empty' }, { status: 400 });
    }

    // Optional: enforce max length
    if (prompt.length > 2000) {
      return NextResponse.json({ error: 'Prompt too long' }, { status: 400 });
    }
    // Build messages (system instruction helps shape behaviour)
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: "You are Bua, a friendly assistant for school-related questions. Keep answers short, kind, and redact PII when needed." },
      { role: 'user', content: prompt }
    ];
    

    // Call OpenAI Responses API (chat-style). Adjust parameters if you prefer streaming.
    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.2),
      max_tokens: 700,
    });

    // The exact shape depends on SDK; pick text from the response
    const text = resp?.choices?.[0]?.message?.content ?? '';

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error('AI route error', err);
    return NextResponse.json({ error: 'AI error' }, { status: 500 });
  }
}
