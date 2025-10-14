//bua/src/lib/gemini.ts
import type { Case } from '../../types';


class MockGoogleGenAI {
  models = {
    generateContent: async (params: { model: string, contents: any, config?: any }) => {
      // Simulate network delay
      await new Promise(res => setTimeout(res, 800 + Math.random() * 800));
      
      const prompt = typeof params.contents === 'string' 
        ? params.contents 
        : params.contents?.parts?.find((p: any) => p.text)?.text || '';

      let text = 'I am an AI assistant here to help you with questions about school life. How can I assist you today?';
      
      if (params.config?.systemInstruction?.includes('Redact PII')) {
        text = `${prompt.replace(/Ms\. Jones/gi, '[REDACTED_TEACHER]').replace(/Room 301/gi, '[REDACTED_LOCATION]').replace(/Sarah/gi, '[REDACTED_STUDENT]')}`;
      } else if (params.config?.systemInstruction?.includes('summarize these cases')) {
        text = `This month, a pattern emerged regarding facility maintenance. Multiple reports cited issues with broken lockers and malfunctioning water fountains in the west wing. These incidents suggest a need for a proactive maintenance schedule review. Addressing these concerns would improve student safety and daily experience. It is recommended that the maintenance department conduct a full audit of west wing facilities.`;
      } else if (prompt.toLowerCase().includes('cut my hair')) {
        text = `I understand this is a sensitive issue. According to the official school district policy (Section 4, Paragraph B on Student Appearance), teachers and staff cannot enforce grooming standards beyond what is written in the student handbook, which focuses on safety and non-disruption. Forcing a student to change their appearance could be a violation of this policy. \n\nSuggested next steps:\n1. **Review the Student Handbook:** You can find it on the school website.\n2. **Talk to a Trusted Adult:** A school counselor or a dean can provide guidance.\n3. **Report the Issue:** If this is part of a pattern of discrimination or bullying, reporting it can help the school take action. \n\nWould you like me to help you start a report?`;
      } else if (prompt.toLowerCase().includes('public speaking')) {
        text = `That's a fantastic goal to work on! Developing strong public speaking skills is very valuable. Here are some resources available at our school:\n\n* **Debate Club:** Meets Tuesdays at 3:30 PM in Room 212. This is great for structured argumentation and quick thinking.\n* **Drama Club:** Rehearsals are on Thursdays in the auditorium. Perfect for building confidence and stage presence.\n* **Student Government:** Elections are coming up! Running for a position is a great way to practice speaking.\n\nYou can find sign-up sheets on the bulletin board outside the main office. Good luck!`;
      }

      return { text };
    },
  };
}

const ai = new MockGoogleGenAI();

export const geminiService = {
  getAdvisorResponse: async (prompt: string): Promise<string> => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text;
    } catch (error) {
      console.error("Gemini API error:", error);
      return "I'm sorry, I encountered an error. Please try again later.";
    }
  },

  redactPII: async (text: string): Promise<string> => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: text,
        config: {
          systemInstruction: 'You are a privacy expert. Redact PII (Personally Identifiable Information) like names, specific locations, or dates from the following text, replacing them with placeholders like [REDACTED_PERSON]. Return only the redacted text.',
        },
      });
      return response.text;
    } catch (error) {
      console.error("Gemini PII redaction error:", error);
      return "Error redacting text. Please review manually.";
    }
  },

  summarizeForJournal: async (cases: Case[]): Promise<string> => {
    const caseSummaries = cases.map(c => `Case ID ${c.id} (${c.category}): ${c.redactedDescription}`).join('\n---\n');
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: caseSummaries,
        config: {
          systemInstruction: 'You are an education policy analyst. Summarize these cases to identify trends and suggest school-level actions. Do not mention any individuals or specific case details. Focus on the systemic issues. Format the output as a brief for a public journal.',
        },
      });
      return response.text;
    } catch (error) {
      console.error("Gemini summarization error:", error);
      return "Error generating summary.";
    }
  },
};