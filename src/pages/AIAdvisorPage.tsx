// bua/pages/AIAdvisorPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../../types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";
import { IconPaperAirplane, IconSparkles } from "@/components/Icons";
import { getAuth, onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

// Firestore list + delete
import { db } from "../lib/firebase/client";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

// ✅ Markdown rendering
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
// If you ever need to allow raw HTML (not recommended unless you trust the source):
// import rehypeRaw from "rehype-raw";

const LOCAL_CHAT_KEY = "bua_chatId";
const INIT_TEXT =
  "Hi! I'm Bua, your AI advisor. You can ask me anything about school life, from policies to clubs. How can I help you today?";

interface Props {
  onNavigate: (page: string, context?: any) => void;
}

type ChatListItem = {
  id: string;
  title?: string;
  updatedAt?: { toDate?: () => Date } | string | null;
  lastUser?: string;
};

// Small helper: a styled Markdown renderer for chat bubbles
const MessageMarkdown: React.FC<{ children: string }> = ({ children }) => {
  return (
    <ReactMarkdown
      // Enable **bold**, _italics_, lists, tables, task-lists, autolinks, etc.
      remarkPlugins={[remarkGfm, remarkBreaks]}
      // If you enabled rehypeRaw above, add: rehypePlugins={[rehypeRaw]}
      components={{
        p: ({ node, ...props }) => (
          <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
        ),
        strong: ({ node, ...props }) => <strong {...props} />,
        em: ({ node, ...props }) => <em {...props} />,
        ul: ({ node, ...props }) => (
          <ul className="list-disc pl-5 my-2 space-y-1" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />
        ),
        li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
        a: ({ node, ...props }) => (
          <a
            className="underline decoration-blue-500 hover:decoration-blue-700"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        code: ({ inline, children, ...props }) =>
          inline ? (
            <code
              className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 text-sm"
              {...props}
            >
              {children}
            </code>
          ) : (
            <code {...props}>{children}</code>
          ),
        pre: ({ node, ...props }) => (
          <pre
            className="my-2 max-w-full overflow-x-auto rounded-md bg-slate-900 text-slate-100 p-3 text-sm"
            {...props}
          />
        ),
        h1: ({ node, ...props }) => <h1 className="text-lg font-bold mb-2" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-base font-bold mb-2" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-base font-semibold mb-2" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
};

const AIAdvisorPage: React.FC<Props> = ({ onNavigate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "init", sender: "ai", text: INIT_TEXT },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(
    () => localStorage.getItem(LOCAL_CHAT_KEY) || null
  );

  const lastUserTextRef = useRef<string>("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Track the current uid so we can detect account switches (clear stale chatId)
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  // Keep firebase auth state
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => setFirebaseUser(u));
    return () => unsub();
  }, []);

  // When user changes, nuke any chatId from the previous user to prevent 403
  useEffect(() => {
    const uid = firebaseUser?.uid ?? null;
    if (uid && currentUid === null) {
      setCurrentUid(uid);
      return;
    }
    if (uid && currentUid && uid !== currentUid) {
      localStorage.removeItem(LOCAL_CHAT_KEY);
      setActiveChatId(null);
      setMessages([{ id: "init", sender: "ai", text: INIT_TEXT }]);
      setError(null);
      setCurrentUid(uid);
    }
  }, [firebaseUser, currentUid]);

  // Subscribe to user's chat list
  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, "aiChats"),
      where("ownerUid", "==", firebaseUser.uid),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: ChatListItem[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title:
            data.title ||
            data.history?.find((h: any) => h.role === "user")?.text?.slice(0, 40),
          updatedAt: data.updatedAt ?? null,
          lastUser:
            data.history?.slice().reverse().find((h: any) => h.role === "user")
              ?.text,
        };
      });
      setChats(items);
    });
    return () => unsub();
  }, [firebaseUser]);

  // Get a fresh ID token (force refresh) with optional timeout
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

  // Resume or load selected chat history (handles 403 -> fresh)
  const loadChat = async (chatId: string) => {
    if (!firebaseUser) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getIdToken(true);
      if (!token) {
        setError("You must be logged in to load chat.");
        return;
      }
      const res = await fetch("/api/ai/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId, message: "" }),
      });

      if (res.status === 403) {
        // Chat belongs to a different user; drop stale id and start fresh
        localStorage.removeItem(LOCAL_CHAT_KEY);
        setActiveChatId(null);
        setMessages([{ id: "init", sender: "ai", text: INIT_TEXT }]);
        setError("Couldn't resume that conversation, so we started a new one.");
        return;
      }

      const data = await res.json().catch(() => ({ error: "Invalid JSON" }));
      if (!res.ok || data?.error) {
        setError(data?.error ?? "Failed to load chat.");
      } else if (Array.isArray(data.history)) {
        const ui = data.history.map((h: any) => ({
          id: crypto.randomUUID(),
          sender: h.role === "user" ? "user" : "ai",
          text: h.text,
        })) as ChatMessage[];
        setMessages(ui.length ? ui : [{ id: "init", sender: "ai", text: INIT_TEXT }]);
        localStorage.setItem(LOCAL_CHAT_KEY, chatId);
        setActiveChatId(chatId);
      }
    } catch {
      setError("Failed to load chat.");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-load active chat if we have one and user is ready
  useEffect(() => {
    const chatId = localStorage.getItem(LOCAL_CHAT_KEY);
    if (chatId && firebaseUser) {
      loadChat(chatId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  const newChat = () => {
    localStorage.removeItem(LOCAL_CHAT_KEY);
    setActiveChatId(null);
    setMessages([{ id: "init", sender: "ai", text: INIT_TEXT }]);
    setError(null);
  };

  const deleteChat = async (id: string) => {
    if (!firebaseUser) return;
    try {
      await deleteDoc(doc(db, "aiChats", id));
      if (activeChatId === id) {
        newChat();
      }
    } catch (e) {
      console.error("Delete chat failed:", e);
      setError("Could not delete chat.");
    }
  };

  const handleSend = async () => {
    if (isLoading) return;
    if (!firebaseUser) {
      setError("Please sign in to use the AI advisor.");
      pushMessage({
        id: crypto.randomUUID(),
        sender: "ai",
        text: "Please log in to chat with the advisor.",
      });
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) return;

    lastUserTextRef.current = trimmed;
    pushMessage({ id: crypto.randomUUID(), sender: "user", text: trimmed });
    setInput("");
    setIsLoading(true);
    setError(null);

    const callWith = async (idToken: string, chatId: string | null) => {
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

      const initialChatId = localStorage.getItem(LOCAL_CHAT_KEY) || null;
      let res = await callWith(token, initialChatId);

      // If token invalid, refresh once
      if (res.status === 401) {
        token = await getIdToken(true);
        if (!token) {
          setError("Unable to refresh ID token. Please sign in again.");
          pushMessage({
            id: crypto.randomUUID(),
            sender: "ai",
            text: "Please sign in again to continue.",
          });
          setIsLoading(false);
          return;
        }
        res = await callWith(token, initialChatId);
      }

      // If forbidden (ownership mismatch), drop chatId and retry as new chat
      if (res.status === 403) {
        localStorage.removeItem(LOCAL_CHAT_KEY);
        setActiveChatId(null);
        res = await callWith(token, null);
      }

      const data = await res.json().catch(() => ({ error: "Invalid JSON from server" }));

      if (!res.ok || data?.error) {
        const msg = data?.error ?? "AI service error";
        setError(msg);
        pushMessage({ id: crypto.randomUUID(), sender: "ai", text: `Error: ${msg}` });
      } else {
        if (data.chatId) {
          localStorage.setItem(LOCAL_CHAT_KEY, data.chatId);
          setActiveChatId(data.chatId);
        }
        const aiText: string =
          typeof data.text === "string" ? data.text : Array.isArray(data.history) ? "" : "No reply.";
        pushMessage({
          id: crypto.randomUUID(),
          sender: "ai",
          text: aiText || "No reply from advisor.",
        });
      }
    } catch (err) {
      console.error("handleSend exception:", err);
      setError("Failed to contact AI service.");
      pushMessage({
        id: crypto.randomUUID(),
        sender: "ai",
        text: "Sorry — couldn't reach the advisor.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 🔧 Hardened handler
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

      // Try to parse JSON; if HTML (e.g., 404 page), this will throw
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error("The server returned an unexpected response.");
      }

      if (!(res.status === 200 || res.status === 201) || data?.error) {
        throw new Error(data?.error || "Summarisation failed");
      }

      const s = data?.summary;
      if (!s || typeof s.title !== "string" || typeof s.category !== "string" || !Array.isArray(s.keyFacts)) {
        throw new Error("Invalid summary format returned by server.");
      }

      onNavigate("report", { prefillStructured: s });
    } catch (e: any) {
      console.error("startReportFromLastUser error:", e);
      setError(e?.message || "Could not start report");
      // Optional: also show this inline in chat to guide the user
      pushMessage({
        id: crypto.randomUUID(),
        sender: "ai",
        text: "I couldn’t prepare the report details. Please try again in a moment.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !isLoading) handleSend();
  };

  const sortedChats = useMemo(() => chats, [chats]);

  return (
    // Lock the panel height, prevent outer scroll, and allow inner panels to manage their own scrolling.
    <div className="mx-auto max-w-6xl h-[calc(100vh-8rem)] min-h-0 overflow-hidden">
      {/* Two-column layout; min-h-0 + overflow-hidden so the inner scroll area is the messages list */}
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_3.5fr] gap-4 h-full min-h-0 overflow-hidden">
        {/* Sidebar (darker blue than chat area) */}
        <aside className="hidden md:block h-full min-h-0 overflow-hidden">
          <Card className="h-full min-h-0 flex flex-col overflow-hidden bg-blue-900/40 dark:bg-blue-900/50 border-blue-900/50">
            <div className="px-4 py-3 border-b border-blue-800/60">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-blue-50">Your chats</p>
                <Button size="sm" variant="secondary" onClick={newChat}>
                  New
                </Button>
              </div>
            </div>

            {/* Scrollable chat list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1">
              {sortedChats.length === 0 && (
                <div className="text-xs text-blue-100/80 px-2 pt-3">No conversations yet.</div>
              )}
              {sortedChats.map((c) => {
                const isActive = activeChatId === c.id;
                const label =
                  c.title?.trim() ||
                  c.lastUser?.slice(0, 40) ||
                  "Untitled chat";
                return (
                  <div
                    key={c.id}
                    className={`group flex items-center justify-between gap-2 rounded-md px-2 py-2 cursor-pointer ${
                      isActive
                        ? "bg-blue-800/50 text-blue-50"
                        : "hover:bg-blue-800/30 text-blue-100"
                    }`}
                  >
                    <button
                      className="truncate text-left flex-1"
                      onClick={() => loadChat(c.id)}
                      title={label}
                    >
                      {label}
                    </button>
                    <button
                      className="opacity-70 hover:opacity-100 text-xs"
                      title="Delete chat"
                      onClick={() => deleteChat(c.id)}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </aside>

        {/* Chat panel (lighter surface; messages list is the only scroll area) */}
        <section className="h-full min-h-0 overflow-hidden pt-2">
          <div className="flex items-center justify-between mb-4 px-1">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">AI Advisor</h1>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={newChat}>New conversation</Button>
            </div>
          </div>

          <Card className="h-[calc(100%-2.75rem)] min-h-0 flex flex-col overflow-hidden bg-white/90 dark:bg-slate-800/80">
            {/* Messages — the sole scroll region */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              {messages.map((m) => {
                const isAI = m.sender === "ai";
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${!isAI ? "justify-end" : ""}`}>
                    {isAI && (
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                        <IconSparkles />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        !isAI
                          ? "bg-blue-600 text-white rounded-br-none"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none"
                      }`}
                    >
                      {/* ✅ Render Markdown instead of plain text */}
                      <MessageMarkdown>{m.text}</MessageMarkdown>

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
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                    <IconSparkles />
                  </div>
                  <div className="max-w-[80%] p-3 rounded-lg bg-slate-100 dark:bg-slate-700">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                      <Spinner /> Thinking...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer — pinned, non-scrollable */}
            <div className="border-t border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about rules, clubs, wellbeing..."
                  disabled={isLoading || !firebaseUser}
                  aria-label="Chat input"
                />
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim() || !firebaseUser}
                  aria-label="Send message"
                >
                  {isLoading ? <Spinner /> : <IconPaperAirplane />}
                </Button>
                <Button
                  variant="secondary"
                  onClick={startReportFromLastUser}
                  disabled={isLoading || !firebaseUser}
                >
                  Start a Report
                </Button>
              </div>

              {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default AIAdvisorPage;
