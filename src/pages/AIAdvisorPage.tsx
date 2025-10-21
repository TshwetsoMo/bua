// bua/pages/AIAdvisorPage.tsx
import React, { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Spinner } from "@/components/Spinner";
import { IconPaperAirplane, IconSparkles } from "@/components/Icons";
import { getAuth, onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

const LOCAL_CHAT_KEY = "bua_chatId";
const INIT_TEXT =
  "Hi! I'm Bua, your AI advisor. You can ask me anything about school life, from policies to clubs. How can I help you today?";

interface Props {
  onNavigate: (page: string, context?: any) => void;
}

/** Polished chat bubble with subtle shadows and optional CTA */
function ChatBubble({
  isAI,
  children,
  timestamp,
  onAction,
}: {
  isAI: boolean;
  children: React.ReactNode;
  timestamp?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`flex items-end gap-2 ${isAI ? "" : "justify-end"}`}>
      {isAI && (
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shadow-sm">
          <span className="text-sm">✨</span>
        </div>
      )}
      <div
        className={[
          "max-w-[80%] rounded-2xl px-4 py-3 shadow-sm",
          isAI
            ? "bg-slate-100 dark:bg-slate-700/70 text-slate-800 dark:text-slate-100 rounded-bl-md"
            : "bg-blue-600 text-white rounded-br-md",
        ].join(" ")}
      >
        <div className="whitespace-pre-wrap leading-relaxed">{children}</div>

        {onAction && (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 mt-3 text-xs font-medium px-3 py-1.5 rounded-full
                     bg-white/70 text-blue-700 hover:bg-white shadow-sm
                     dark:bg-slate-800/60 dark:text-blue-200 dark:hover:bg-slate-800/80
                     transition-colors active:scale-[0.98]"
          >
            Start a report
          </button>
        )}

        {timestamp && <div className="mt-1 text-[11px] opacity-60">{timestamp}</div>}
      </div>
    </div>
  );
}

const AIAdvisorPage: React.FC<Props> = ({ onNavigate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "init", sender: "ai", text: INIT_TEXT }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastUserTextRef = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // scroll-to-bottom on new messages or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // watch auth state
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUser(u));
    return () => unsub();
  }, []);

  // Get a fresh ID token (with fallback & small timeout watcher)
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

  // Try to resume chat (if server supports returning history with empty message)
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

      // If server says token invalid/expired (401), try refreshing token once then retry
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

  // Start report from the last user text by calling your summarise endpoint
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

      // IMPORTANT: your endpoint uses British spelling "summarise"
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
        throw new Error(data?.error || "Summarisation failed");
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

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">AI Advisor</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ask about policies, clubs, wellbeing…</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              localStorage.removeItem(LOCAL_CHAT_KEY);
              setMessages([{ id: "init", sender: "ai", text: INIT_TEXT }]);
              setError(null);
            }}
            className="rounded-xl"
          >
            New conversation
          </Button>
        </div>
      </div>

      <Card className="flex-grow flex flex-col rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60">
        {/* Messages */}
        <div
          className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4 p-4"
          aria-live="polite"
          aria-busy={isLoading ? "true" : "false"}
        >
          {messages.map((m) => {
            const isAI = m.sender === "ai";
            const wantsCTA = isAI && m.text.toLowerCase().includes("start a report");
            return (
              <ChatBubble
                key={m.id}
                isAI={isAI}
                onAction={wantsCTA ? startReportFromLastUser : undefined}
                timestamp={undefined}
              >
                {m.text}
              </ChatBubble>
            );
          })}

          {isLoading && (
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shadow-sm">
                <span className="text-sm">✨</span>
              </div>
              <div className="max-w-[80%] rounded-2xl px-4 py-3 shadow-sm bg-slate-100 dark:bg-slate-700/70">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                  <Spinner /> Thinking…
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Sticky composer */}
        <div className="sticky bottom-0 left-0 bg-white/70 dark:bg-slate-900/60 backdrop-blur supports-[backdrop-filter]:bg-white/50 dark:supports-[backdrop-filter]:bg-slate-900/40">
          <div className="border-t border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!isLoading) handleSend();
                  }
                }}
                rows={1}
                placeholder="Type your message… (Shift+Enter for newline)"
                disabled={isLoading || !firebaseUser}
                className="flex-1 max-h-40 min-h-[44px] resize-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Chat input"
              />
              <Button
                onClick={handleSend}
                disabled={isLoading || !input.trim() || !firebaseUser}
                aria-label="Send message"
                className="rounded-xl active:scale-[0.98]"
              >
                {isLoading ? <Spinner /> : <IconPaperAirplane />}
              </Button>
              <Button
                variant="secondary"
                onClick={startReportFromLastUser}
                disabled={!lastUserTextRef.current || isLoading}
                className="rounded-xl active:scale-[0.98]"
              >
                Start a Report
              </Button>
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Press Enter to send</span>
              {error && <span className="text-red-500">{error}</span>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AIAdvisorPage;
