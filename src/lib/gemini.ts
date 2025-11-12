// bua/src/lib/gemini.ts
import type { Case } from "../../types";

/**
 * Lightweight mock of Google GenAI for local/dev use.
 * We keep systemInstruction checks to simulate different behaviours.
 */
class MockGoogleGenAI {
  models = {
    generateContent: async (params: {
      model: string;
      contents: any;
      config?: { systemInstruction?: string };
    }) => {
      // Simulate network latency
      await new Promise((res) => setTimeout(res, 600 + Math.random() * 600));

      // Extract prompt text from either string or {parts:[{text}]}
      const prompt =
        typeof params.contents === "string"
          ? params.contents
          : params.contents?.parts?.find((p: any) => p.text)?.text || "";

      let text =
        "I am an AI assistant here to help you with questions about school life. How can I assist you today?";

      const sys = params.config?.systemInstruction || "";

      // ----- Redaction mode -----
      if (sys.includes("Redact PII")) {
        text = `${prompt
          .replace(/Ms?\.?\s*Jones/gi, "[REDACTED_TEACHER]")
          .replace(/\bRoom\s*\d+\b/gi, "[REDACTED_LOCATION]")
          .replace(/\bSarah\b/gi, "[REDACTED_STUDENT]")}`;
      }
      // ----- Journal summarisation mode -----
      else if (
        sys.includes("summarise these cases") ||
        sys.includes("summarize these cases")
      ) {
        // Keep a generic fallback (rarely used now that i generate varied text below)
        text =
          "This period shows a pattern around facility maintenance. Multiple reports mention broken lockers and malfunctioning water fountains in the west wing. These point to a need for a proactive maintenance plan and faster ticket resolution. Recommended: a targeted audit of west wing infrastructure, clearer reporting SLAs, and termly preventive checks.";
      }
      // ----- Report prefill mode -----
      else if (
        sys.includes("produce a structured report prefill") ||
        sys.includes("structured summary (title, category, key facts)")
      ) {
        const lower = prompt.toLowerCase();
        let category = "Other";
        if (lower.includes("bully") || lower.includes("threat")) category = "Bullying";
        else if (lower.includes("toilet") || lower.includes("broken") || lower.includes("water"))
          category = "Facilities";
        else if (lower.includes("rule") || lower.includes("policy")) category = "Policy";
        else if (lower.includes("grade") || lower.includes("teacher") || lower.includes("class"))
          category = "Academics";

        const title =
          prompt.length > 90 ? prompt.slice(0, 90).trim() + "…" : prompt.trim();

        const keyFacts: string[] = [];
        if (lower.match(/\b(grade|mark|assessment|test|assignment)\b/)) keyFacts.push("Assessment/marks involved");
        if (lower.match(/\b(teacher|principal|staff)\b/)) keyFacts.push("Staff involved");
        if (lower.match(/\b(rule|policy|code)\b/)) keyFacts.push("Policy/rule referenced");
        if (lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}|\b\d{1,2}\s*(am|pm)\b)\b/))
          keyFacts.push("Time/date mentioned");
        if (lower.match(/\b(room|class|hall|toilet|block|wing)\b/))
          keyFacts.push("Location mentioned");

        text = JSON.stringify({ title, category, keyFacts });
      }
      // ----- Example canned responses -----
      else if (prompt.toLowerCase().includes("cut my hair")) {
        text =
          "I understand this is a sensitive issue. According to the official school district policy (Section 4, Paragraph B on Student Appearance), teachers and staff cannot enforce grooming standards beyond what is written in the student handbook, which focuses on safety and non-disruption. Forcing a student to change their appearance could be a violation of this policy.\n\nSuggested next steps:\n1. **Review the Student Handbook** (school website).\n2. **Talk to a Trusted Adult** (counsellor/dean).\n3. **Report the Issue** if this is part of discrimination or bullying.\n\nWould you like me to help you start a report?";
      } else if (prompt.toLowerCase().includes("public speaking")) {
        text =
          "That's a fantastic goal! Resources available:\n\n• **Debate Club** — Tuesdays 3:30, Room 212\n• **Drama Club** — Thursdays, Auditorium\n• **Student Government** — Elections soon\n\nSign-up sheets at the main office.";
      }

      return { text };
    },
  };
}

const ai = new MockGoogleGenAI();

/** Small utilities for deterministic, varied summaries in mock mode */
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function pick<T>(arr: T[], seed: number, salt: number) {
  return arr[(seed + salt) % arr.length];
}
function truncateSentence(s: string, max = 160) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trim() + "…";
}

/**
 * Public service API used by my pages.
 * i export both named and default to avoid import-shape mistakes.
 */
export const geminiService = {
  async getAdvisorResponse(prompt: string): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error("Gemini API error:", error);
      return "I'm sorry, I encountered an error. Please try again later.";
    }
  },

  async redactPII(text: string): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: text,
        config: {
          systemInstruction:
            "You are a privacy expert. Redact PII (Personally Identifiable Information) like names, specific locations, or dates from the following text, replacing them with placeholders like [REDACTED_PERSON]. Return only the redacted text.",
        },
      });
      return response.text;
    } catch (error) {
      console.error("Gemini PII redaction error:", error);
      return "Error redacting text. Please review manually.";
    }
  },

  /**
   * Structured prefill for the Report page (title, category, keyFacts[])
   */
  async summariseForReport(userText: string): Promise<{
    title: string;
    category: string;
    keyFacts: string[];
  }> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: [{ text: userText }] },
        config: {
          systemInstruction:
            "Analyse the student's message and produce a structured summary (title, category, key facts) for a school issue report. Use JSON with keys: title, category, keyFacts. keyFacts must be an array of short bullet points. Only return JSON. This is to produce a structured report prefill.",
        },
      });

      const parsed =
        typeof response.text === "string"
          ? JSON.parse(response.text)
          : { title: userText, category: "Other", keyFacts: [] };

      return {
        title: parsed.title ?? userText,
        category: parsed.category ?? "Other",
        keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
      };
    } catch (error) {
      console.error("Gemini summariseForReport error:", error);
      return { title: userText, category: "Other", keyFacts: [] };
    }
  },

  /**
   * Journal summary from anonymised cases.
   * summariseCasesForJournal
   *
   * Now generates varied, deterministic text based on the picked cases so
   * consecutive posts won’t look identical.
   */
  async summariseCasesForJournal(
    cases: Pick<Case, "id" | "category" | "redactedDescription">[]
  ): Promise<string> {
    // Build a deterministic seed from case IDs
    const seed = hashString(cases.map((c) => c.id).sort().join("|"));

    // Count categories and grab short snippets from redactedDescription
    const counts: Record<string, number> = {};
    const snippets: string[] = [];
    for (const c of cases) {
      counts[c.category] = (counts[c.category] || 0) + 1;
      if (c.redactedDescription) {
        snippets.push(truncateSentence(c.redactedDescription, 140));
      }
    }
    const categories = Object.keys(counts).sort();

    // Choose template/wording variants deterministically
    const trendOpeners = [
      "Recent reports indicate",
      "The latest submissions suggest",
      "This period highlights",
      "A fresh review of cases shows",
      "In the most recent incidents, we see",
    ];
    const patternPhrases = [
      "a recurring theme around",
      "clear signals of pressure in",
      "an emerging pattern focused on",
      "a notable concentration in",
      "heightened concern regarding",
    ];
    const recOpeners = [
      "Recommended next steps:",
      "Proposed actions:",
      "Suggested remedies:",
      "Actionable follow-ups:",
      "Immediate considerations:",
    ];
    const recItemsByCategory: Record<string, string[]> = {
      Facilities: [
        "log issues via a single channel with clear SLAs",
        "conduct a targeted audit of affected blocks",
        "schedule termly preventive maintenance checks",
        "publish repair status boards for transparency",
      ],
      Bullying: [
        "reinforce anti-bullying reporting and response timelines",
        "increase adult visibility during transitions",
        "run peer-support awareness sessions",
        "monitor hotspots and refine duty rosters",
      ],
      Policy: [
        "re-state the policy with concrete examples",
        "align enforcement to written rules only",
        "issue a staff circular clarifying scope and limits",
        "collect student feedback before termly updates",
      ],
      Academics: [
        "enforce rubric-based feedback for all assessments",
        "offer re-mark or moderation pathways when requested",
        "publish marking turn-around times",
        "provide clinics on rubric interpretation",
      ],
      Other: [
        "triage to the appropriate panel within 48 hours",
        "publish clearer contact points for learners",
        "track resolution outcomes in a shared dashboard",
        "include the issue in the next governance review",
      ],
    };

    const opener = pick(trendOpeners, seed, 1);
    const pattern = pick(patternPhrases, seed, 7);
    const recTitle = pick(recOpeners, seed, 19);

    // Build a category-focused sentence
    const catReadable =
      categories.length === 1
        ? `${categories[0]} (${counts[categories[0]]} case${counts[categories[0]] > 1 ? "s" : ""})`
        : categories
            .map((c) => `${c.toLowerCase()} (${counts[c]})`)
            .join(", ");

    // Pick 2–3 recommendations based on present categories
    const present = categories.length ? categories : ["Other"];
    const recs: string[] = [];
    let salt = 31;
    for (const cat of present) {
      const bank = recItemsByCategory[cat] || recItemsByCategory.Other;
      recs.push(pick(bank, seed, salt));
      salt += 13;
    }
    // ensure 2–3 items total
    while (recs.length < 2) {
      recs.push(pick(recItemsByCategory.Other, seed, (salt += 11)));
    }
    if (recs.length > 3) recs.length = 3;

    // Optional: include 1 concrete (anonymised) snippet for colour, if available
    const sample = snippets.length ? pick(snippets, seed, 5) : "";

    const para1 = `${opener} ${pattern} ${catReadable}. ${
      sample ? `One anonymised account notes: “${sample}” ` : ""
    }Overall, these cases point to operational gaps that can be closed with clearer ownership and faster follow-through.`;

    const para2 = `${recTitle} ${recs.map((r) => `• ${r}`).join("; ")}.`;

    return `${para1}\n\n${para2}`;
  },

  // American spelling aliases
  async summarizeForJournal(cases: Case[]): Promise<string> {
    const trimmed = cases.map((c) => ({
      id: c.id,
      category: c.category,
      redactedDescription: c.redactedDescription,
    }));
    return this.summariseCasesForJournal(trimmed);
  },

  async summarizeForReport(userText: string) {
    return this.summariseForReport(userText);
  },
};

export default geminiService;
