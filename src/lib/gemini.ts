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

        const keyFacts = [];
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

/**
 * Public service API used by your pages.
 * We export both named and default to avoid import-shape mistakes.
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
   * British spelling: summariseCasesForJournal
   */
  async summariseCasesForJournal(
    cases: Pick<Case, "id" | "category" | "redactedDescription">[]
  ): Promise<string> {
    const caseSummaries = cases
      .map(
        (c) =>
          `• Case ${c.id} [${c.category}]: ${c.redactedDescription || "(no details)"}`
      )
      .join("\n");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              text:
                "Summarise these anonymised, recent incidents for a public journal. Avoid repeating the exact wording of prior themes; focus on what is *newly* notable in this batch. Prioritise systemic patterns and actionable, school-level recommendations.\n\n" +
                caseSummaries,
            },
          ],
        },
        config: {
          systemInstruction:
            "You are an education policy analyst: summarise these cases to identify **recent** trends and suggest school-level actions. Do not mention individuals or specific case details. Output 1–2 concise paragraphs. (Instruction: summarise these cases, avoid repetition with previous themes.)",
        },
      });
      return response.text;
    } catch (error) {
      console.error("Gemini summarisation error:", error);
      return "Error generating summary.";
    }
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
