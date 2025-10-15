// bua/pages/AIAdvisorPage.tsx
import React, { useState, useEffect, useRef } from "react";
import type { ChatMessage } from "../../types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";
import { IconPaperAirplane, IconSparkles } from "@/components/Icons";
import { getAuth } from "firebase/auth";

interface AIAdvisorPageProps {
  onNavigate: (page: string, context?: any) => void;
}

const LOCAL_CHAT_KEY = "bua_chatId";
const initialAiText =
  "Hi! I'm Bua, your AI advisor. You can ask me anything about school life, from policies to clubs. How can I help you today?";

// Helper to get Firebase ID token for current user
const getIdToken = async (): Promise<string> => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      console.warn("No logged-in user found when requesting ID token");
      return "";
    }
    return await user.getIdToken();
  } catch (err) {
    console.error("Failed to get ID token:", err);
    return "";
  }
};

const AIAdvisorPage: React.FC<AIAdvisorPageProps> = ({ onNavigate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "init", sender: "ai", text: initialAiText },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserTextRef = useRef<string>("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [messages, isLoading]);

  // Helper: push a message to UI
  const pushMessage = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  // Start a fresh conversation
  const startNewConversation = () => {
    localStorage.removeItem(LOCAL_CHAT_KEY);
    setMessages([{ id: "init", sender: "ai", text: initialAiText }]);
    setError(null);
  };

  // Load previous chat from server if chatId exists
  useEffect(() => {
    const resumeChat = async () => {
      const chatId = localStorage.getItem(LOCAL_CHAT_KEY);
      if (!chatId) return;

      setIsLoading(true);
      setError(null);
      try {
        const token = await getIdToken();
        if (!token) {
          setError("You must be logged in to resume your chat.");
          return;
        }

        const res = await fetch("/api/ai/gemini/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ chatId, message: "" }), // empty message to just fetch history
        });

        const data = await res.json().catch(() => ({ error: "Invalid response from server" }));

        if (!res.ok || data?.error) {
          const errMsg = data?.error ?? "Failed to load chat history.";
          setError(errMsg);
          pushMessage({ id: crypto.randomUUID(), sender: "ai", text: `Error: ${errMsg}` });
        } else if (data?.history && Array.isArray(data.history)) {
          setMessages(
            data.history.map((m: any) => ({
              id: crypto.randomUUID(),
              sender: m.role === "user" ? "user" : "ai",
              text: m.text,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to resume chat:", err);
        setError("Failed to resume previous chat.");
      } finally {
        setIsLoading(false);
      }
    };

    resumeChat();
  }, []);

  const handleSend = async () => {
    if (isLoading) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    lastUserTextRef.current = trimmed;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), sender: "user", text: trimmed };
    pushMessage(userMsg);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const chatId = localStorage.getItem(LOCAL_CHAT_KEY) || null;
      const token = await getIdToken();
      if (!token) {
        setError("You must be logged in to send messages.");
        pushMessage({ id: crypto.randomUUID(), sender: "ai", text: "Please log in to continue the conversation." });
        return;
      }

      const res = await fetch("/api/ai/gemini/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chatId, message: trimmed }),
      });

      const data = await res.json().catch(() => ({ error: "Invalid response from server" }));

      if (!res.ok || data?.error) {
        const errMsg = data?.error ?? "Failed to contact AI service.";
        setError(errMsg);
        pushMessage({ id: crypto.randomUUID(), sender: "ai", text: `Error: ${errMsg}` });
      } else {
        if (data.chatId) localStorage.setItem(LOCAL_CHAT_KEY, data.chatId);
        const aiText: string = data.text ?? "No reply from advisor.";
        pushMessage({ id: crypto.randomUUID(), sender: "ai", text: aiText });
      }
    } catch (err) {
      console.error("AI request failed:", err);
      setError("The advisor is unreachable right now.");
      pushMessage({ id: crypto.randomUUID(), sender: "ai", text: "Sorry, something went wrong contacting the advisor." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !isLoading) handleSend();
  };

  const startReportFromLastUser = () => onNavigate("report", { prefill: lastUserTextRef.current });

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">AI Advisor</h1>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={startNewConversation}>New conversation</Button>
        </div>
      </div>

      <Card className="flex-grow flex flex-col">
        <div className="flex-grow overflow-y-auto pr-4 -mr-4 space-y-4">
          {messages.map((msg) => {
            const isAI = msg.sender === "ai";
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${!isAI ? "justify-end" : ""}`}>
                {isAI && (
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                    <IconSparkles />
                  </div>
                )}
                <div
                  className={`max-w-md p-3 rounded-lg ${
                    !isAI
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {isAI && msg.text.toLowerCase().includes("start a report") && (
                    <Button className="mt-3" variant="secondary" onClick={startReportFromLastUser}>
                      Start a Report
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                <IconSparkles />
              </div>
              <div className="max-w-md p-3 rounded-lg bg-slate-200 dark:bg-slate-700">
                <div className="flex items-center gap-2 text-slate-500">
                  <Spinner /> Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-slate-200 dark:border-slate-700 pt-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about rules, clubs, wellbeing..."
            disabled={isLoading}
            aria-label="Chat input"
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} aria-label="Send message">
            {isLoading ? <Spinner /> : <IconPaperAirplane />}
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
      </Card>
    </div>
  );
};

export default AIAdvisorPage;
