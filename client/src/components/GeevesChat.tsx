/**
 * GeevesChat — Animated Constellation Agent
 *
 * Always visible in the bottom-right corner. The constellation animates
 * (resting → thinking → responding) in sync with LLM calls.
 * Domain-aware: color changes based on which tool the backend called.
 * Minimises to a small pulsing dot when the user clicks the minimise button.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Minus, Send, Trash2, X } from "lucide-react";
import { GeevesConstellationMark } from "@/components/GeevesLogo";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { useLocation } from "wouter";

// ─── Domain colour map ───────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  calendar: "#2AAFA9",
  finance: "#D4A017",
  family: "#E8624A",
  shopping: "#E8943A",
  default: "#2AAFA9",
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  domain?: string;
};

// ─── Constellation SVG (inline, no web component dependency) ────────────────
// ─── Animated brand-mark wrapper ────────────────────────────────────────────
// Uses the brand-accurate GeevesConstellationMark with a glow filter
// that responds to agent state (resting / thinking / responding).
function ConstellationAgent({
  size = 36,
  state = "resting",
  domain = "default",
}: {
  size?: number;
  state?: "resting" | "thinking" | "responding";
  domain?: string;
}) {
  const color = DOMAIN_COLORS[domain] || DOMAIN_COLORS.default;
  const isThinking = state === "thinking";
  const isResponding = state === "responding";

  return (
    <span
      style={{
        display: "inline-flex",
        filter: isThinking
          ? `drop-shadow(0 0 6px ${color})`
          : isResponding
          ? `drop-shadow(0 0 10px ${color})`
          : `drop-shadow(0 0 3px ${color}55)`,
        transition: "filter 0.5s ease",
        animation: isThinking
          ? "geeves-logo-pulse 1.2s ease-in-out infinite alternate"
          : "none",
      }}
    >
      <style>{`
        @keyframes geeves-logo-pulse {
          from { filter: drop-shadow(0 0 4px ${color}88); }
          to   { filter: drop-shadow(0 0 10px ${color}); }
        }
      `}</style>
      <GeevesConstellationMark size={size} />
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export function GeevesChat() {
  const { user } = useAuth();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Check if this member has Geeves AI access
  const { data: accessData } = trpc.geevesAccess.getMyAccess.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
  const hasGeevesAccess = !user || (accessData?.geevesAccess ?? true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [agentState, setAgentState] = useState<"resting" | "thinking" | "responding">("resting");
  const [activeDomain, setActiveDomain] = useState<string>("default");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, navigate] = useLocation();

  // Load chat history when panel opens
  const { data: history } = trpc.geeves.history.useQuery(undefined, {
    enabled: !!user && isPanelOpen && !hasLoadedHistory,
  });

  useEffect(() => {
    if (history && !hasLoadedHistory) {
      const loaded = (history as any[])
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          domain: m.metadata?.domain,
        }));
      setMessages(loaded);
      setHasLoadedHistory(true);
    }
  }, [history, hasLoadedHistory]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLDivElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
        });
      }
    }
  }, [messages]);

  // Chat mutation
  const chatMut = trpc.geeves.chat.useMutation({
    onMutate: () => {
      setAgentState("thinking");
    },
    onSuccess: (data) => {
      const domain = (data as any).domain || "default";
      setActiveDomain(domain);
      setAgentState("responding");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content, domain },
      ]);
      setTimeout(() => setAgentState("resting"), 2500);
    },
    onError: (err) => {
      setAgentState("resting");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `I ran into an issue: ${err.message}. Please try again.`,
        },
      ]);
    },
  });

  const clearMut = trpc.geeves.clearHistory.useMutation({
    onSuccess: () => {
      setMessages([]);
      setHasLoadedHistory(false);
    },
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || chatMut.isPending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    chatMut.mutate({ message: msg });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Intercept in-app links from assistant messages
  const handleLinkClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLAnchorElement;
    if (target.tagName === "A" && target.href) {
      try {
        const url = new URL(target.href);
        if (url.origin === window.location.origin) {
          e.preventDefault();
          navigate(url.pathname + url.search);
          setIsPanelOpen(false);
        }
      } catch {}
    }
  };

  const accentColor = DOMAIN_COLORS[activeDomain] || DOMAIN_COLORS.default;

  // ── Minimised state: small pulsing dot ──────────────────────────────────
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 group"
        aria-label="Open Geeves"
        title="Open Geeves"
      >
        <div
          className="w-4 h-4 rounded-full shadow-lg transition-transform group-hover:scale-125"
          style={{
            backgroundColor: accentColor,
            animation: "geeves-mini-pulse 2.5s ease-in-out infinite",
          }}
        />
        <style>{`
          @keyframes geeves-mini-pulse {
            0%, 100% { box-shadow: 0 0 0 0 ${accentColor}55; transform: scale(1); }
            50% { box-shadow: 0 0 0 6px ${accentColor}00; transform: scale(1.1); }
          }
        `}</style>
      </button>
    );
  }

  // ── Full agent view ─────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Chat panel — slides up when open */}
      {isPanelOpen && (
        <div
          className="w-[360px] rounded-2xl shadow-2xl border overflow-hidden flex flex-col"
          style={{
            height: "480px",
            backgroundColor: "var(--card)",
            borderColor: `${accentColor}30`,
            animation: "geeves-panel-in 0.2s ease-out",
          }}
        >
          <style>{`
            @keyframes geeves-panel-in {
              from { opacity: 0; transform: translateY(12px) scale(0.97); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b shrink-0"
            style={{ borderColor: `${accentColor}20` }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: `0 0 6px ${accentColor}`,
                  animation: agentState !== "resting" ? "geeves-mini-pulse 1s ease-in-out infinite" : "none",
                }}
              />
              <span className="text-sm font-semibold tracking-wide">Geeves</span>
              {agentState !== "resting" && (
                <span className="text-xs text-muted-foreground italic animate-pulse">
                  {agentState === "thinking" ? "thinking…" : "responding…"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => clearMut.mutate()}
                title="Clear history"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setIsPanelOpen(false)}
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-hidden" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 px-5 py-6">
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  Good{" "}
                  {new Date().getHours() < 12
                    ? "morning"
                    : new Date().getHours() < 17
                    ? "afternoon"
                    : "evening"}
                  ,{" "}
                  <span className="font-medium text-foreground">
                    {user?.name?.split(" ")[0] || "there"}
                  </span>
                  . How can I help?
                </p>
                <div className="grid grid-cols-1 gap-2 w-full">
                  {[
                    "What's on my calendar this week?",
                    "What do I need to buy?",
                    "Show me my recent transactions",
                    "Who's in my household?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setMessages([{ role: "user", content: prompt }]);
                        chatMut.mutate({ message: prompt });
                      }}
                      disabled={chatMut.isPending}
                      className="text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-3 p-4" onClick={handleLinkClick}>
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2.5",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {msg.role === "assistant" && (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-white"
                          style={{
                            backgroundColor:
                              DOMAIN_COLORS[msg.domain || "default"] || accentColor,
                          }}
                        >
                          G
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
                          msg.role === "user"
                            ? "text-white"
                            : "bg-muted text-foreground"
                        )}
                        style={
                          msg.role === "user"
                            ? { backgroundColor: accentColor }
                            : undefined
                        }
                      >
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_a]:no-underline [&_a:hover]:underline">
                            <Streamdown>{msg.content}</Streamdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {user?.name?.charAt(0)?.toUpperCase() || "U"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  {chatMut.isPending && (
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                        style={{ backgroundColor: accentColor }}
                      >
                        G
                      </div>
                      <div className="bg-muted rounded-xl px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {[0, 150, 300].map((delay) => (
                            <div
                              key={delay}
                              className="w-1.5 h-1.5 rounded-full animate-bounce"
                              style={{
                                backgroundColor: accentColor,
                                animationDelay: `${delay}ms`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2 p-3 border-t shrink-0"
            style={{
              borderColor: `${accentColor}20`,
              backgroundColor: "var(--card)",
            }}
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Geeves anything…"
              className="flex-1 max-h-24 resize-none min-h-[38px] text-sm"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || chatMut.isPending}
              className="shrink-0 h-[38px] w-[38px] text-white disabled:opacity-40"
              style={{ backgroundColor: accentColor }}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Compact branded pill trigger */}
      <div className="flex items-center gap-1.5">
        {/* Minimise */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-50 hover:opacity-100 transition-opacity"
          onClick={() => setIsMinimized(true)}
          title="Minimise Geeves"
        >
          <Minus className="w-3 h-3" />
        </Button>

        {/* Pill button: logo + label */}
        <button
          onClick={() => {
            if (!user || !hasGeevesAccess) return;
            setIsPanelOpen((prev) => !prev);
          }}
          disabled={!!user && !hasGeevesAccess}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isPanelOpen ? "Close Geeves" : "Open Geeves"}
          title={
            !user ? "Log in to use Geeves"
            : !hasGeevesAccess ? "Geeves access not enabled for this account"
            : isPanelOpen ? "Close Geeves"
            : "Ask Geeves"
          }
          style={{
            backgroundColor: isPanelOpen ? accentColor : "var(--card)",
            border: `1.5px solid ${accentColor}${isPanelOpen ? "" : "60"}`,
            boxShadow: `0 2px 12px ${accentColor}30`,
            color: isPanelOpen ? "#fff" : "var(--foreground)",
            opacity: user && !hasGeevesAccess ? 0.4 : 1,
            cursor: user && !hasGeevesAccess ? "not-allowed" : undefined,
          }}
        >
          <ConstellationAgent
            size={22}
            state={agentState}
            domain={activeDomain}
          />
          <span className="text-xs font-medium tracking-wide pr-0.5">Ask Geeves</span>
        </button>
      </div>
    </div>
  );
}
