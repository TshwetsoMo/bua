import React, { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";
import { IconPaperAirplane, IconSparkles } from "@/components/Icons";
import { getAuth, onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

const LOCAL_CHAT_KEY = "bua_chatId";
const INIT_TEXT =
  "Hi! I'm Bua, your AI advisor. You can ask me anything about school life, from policies to clubs. How can I help you today?";

interface Props {
  onNavigate: (page: string, context?: any) => void;
}

const AIAdvisorPage: React.FC<Props> = ({ onNavigate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "init", sender: "ai", text: INIT_TEXT }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastUserTextRef = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUser(u));
    return () => unsub();
  }, []);

  const getIdToken = async (forceRefresh = true, timeoutMs = 7000): Promise<string> => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      try {
        return await user.getIdToken(forceRefresh);
      } catch {
        try {
          return await user.getIdToken(false);
        } catch {
          return "";
        }
      }
    }

    return new Promise<string>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve("");
        }
      }, timeoutMs);

      const unsub = onAuthStateChanged(getAuth(), async (u) => {
        if (!u) return;
        try {
          const token = await u.getIdToken(forceRefresh);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            unsub();
            resolve(token);
          }
        } catch {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            unsub();
            resolve("");
          }
        }
      });
    });
  };

  const pushMessage = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  // Resume chat (optional — only works if your server returns history when message is "")
  useEffect(() => {
    const resume = async () => {
      const chatId = localStorage.getItem(LOCAL_CHAT_KEY);
      if (!chatId || !firebaseUser) return;

      setIsLoading(true);
      setError(null);
      try {
        const token = await getIdToken(true);
        if (!token) {
          setError("You must be logged in to resume chat.");
          return;
        }

        const res = await fetch("/api/ai/gemini/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ chatId, message: "" }),
        });

        const data = await res.json().catch(() => ({ error: "Invalid JSON" }));
        if (!res.ok || data?.error) {
          setError(data?.error ?? "Failed to resume chat.");
        } else if (Array.isArray(data.history)) {
          const ui = data.history.map((h: any) => ({
            id: crypto.randomUUID(),
            sender: h.role === "user" ? "user" : "ai",
            text: h.text,
          })) as ChatMessage[];
          setMessages(ui.length ? ui : [{ id: "init", sender: "ai", text: INIT_TEXT }]);
        } else if (typeof data.text === "string") {
          setMessages([{ id: crypto.randomUUID(), sender: "ai", text: data.text }]);
        }
      } catch {
        setError("Failed to resume chat.");
      } finally {
        setIsLoading(false);
      }
    };
    resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  const handleSend = async () => {
    if (isLoading) return;
    if (!firebaseUser) {
      setError("Please sign in to use the AI advisor.");
      pushMessage({ id: crypto.randomUUID(), sender: "ai", text: "Please log in to chat with the advisor." });
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) return;

    lastUserTextRef.current = trimmed;
    pushMessage({ id: crypto.randomUUID(), sender: "user", text: trimmed });
    setInput("");
    setIsLoading(true);
    setError(null);

    const doCall = async (idToken: string) => {
      const chatId = localStorage.getItem(LOCAL_CHAT_KEY) || null;
      return fetch("/api/ai/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ chatId, message: trimmed }),
      });
    };

    try {
      let token = await getIdToken(true);
      if (!token) {
        setError("Could not obtain ID token. Please sign in again.");
        setIsLoading(false);
        return;
      }

      let res = await doCall(token);
      let data = await res.json().catch(() => ({ error: "Invalid JSON from server" }));
      if (res.status === 401 || data?.error === "Invalid or expired ID token") {
        token = await getIdToken(true);
        if (!token) {
          setError("Unable to refresh ID token. Please sign in again.");
          pushMessage({ id: crypto.randomUUID(), sender: "ai", text: "Please sign in again to continue." });
          setIsLoading(false);
          return;
        }
        res = await doCall(token);
        data = await res.json().catch(() => ({ error: "Invalid JSON from server (retry)" }));
      }

      if (!res.ok || data?.error) {
        const msg = data?.error ?? "AI service error";
        setError(msg);
        pushMessage({ id: crypto.randomUUID(), sender: "ai", text: `Error: ${msg}` });
      } else {
        if (data.chatId) localStorage.setItem(LOCAL_CHAT_KEY, data.chatId);
        const aiText: string =
          typeof data.text === "string" ? data.text : Array.isArray(data.history) ? "" : "No reply.";
        pushMessage({ id: crypto.randomUUID(), sender: "ai", text: aiText || "No reply from advisor." });
      }
    } catch (err) {
      console.error("handleSend exception:", err);
      setError("Failed to contact AI service.");
      pushMessage({ id: crypto.randomUUID(), sender: "ai", text: "Sorry — couldn't reach the advisor." });
    } finally {
      setIsLoading(false);
    }
  };

  const startReportFromLastUser = async () => {
    const text = lastUserTextRef.current.trim();
    if (!text) {
      pushMessage({
        id: crypto.randomUUID(),
        sender: "ai",
        text: "Please send a message first, then click Start a Report.",
      });
      return;
    }
    if (!firebaseUser) {
      setError("Please sign in to start a report.");
      return;
    }

    try {
      setIsLoading(true);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) throw new Error("Missing ID token");

      const res = await fetch("/api/ai/gemini/summarise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok || data?.error) {
        throw new Error(data?.error || "Summarization failed");
      }

      // navigate with structured prefill
      onNavigate("report", { prefillStructured: data.summary });
    } catch (e: any) {
      console.error("startReportFromLastUser error:", e);
      setError(e?.message || "Could not start report");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !isLoading) handleSend();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">AI Advisor</h1>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              localStorage.removeItem(LOCAL_CHAT_KEY);
              setMessages([{ id: "init", sender: "ai", text: INIT_TEXT }]);
              setError(null);
            }}
          >
            New conversation
          </Button>
        </div>
      </div>

      <Card className="flex-grow flex flex-col">
        <div className="flex-grow overflow-y-auto pr-4 -mr-4 space-y-4">
          {messages.map((m) => {
            const isAI = m.sender === "ai";
            return (
              <div key={m.id} className={`flex items-end gap-2 ${!isAI ? "justify-end" : ""}`}>
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
                  <p className="whitespace-pre-wrap">{m.text}</p>

                  {/* If your AI message suggests it, show this CTA inline */}
                  {isAI && m.text.toLowerCase().includes("start a report") && (
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
            disabled={isLoading || !firebaseUser}
            aria-label="Chat input"
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim() || !firebaseUser} aria-label="Send message">
            {isLoading ? <Spinner /> : <IconPaperAirplane />}
          </Button>

          {/* Optional always-visible CTA: keep it if you want users to start a report any time */}
          <Button variant="secondary" onClick={startReportFromLastUser} disabled={!lastUserTextRef.current || isLoading}>
            Start a Report
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
      </Card>
    </div>
  );
};

export default AIAdvisorPage;




