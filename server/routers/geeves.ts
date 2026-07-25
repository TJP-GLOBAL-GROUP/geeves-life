/**
 * Geeves AI Assistant Router — Tool-Calling Upgrade
 *
 * Uses LLM function calling with an agentic loop (up to 5 iterations).
 * Each tool call is executed server-side and the result is fed back to the LLM.
 * The domain of the first tool called is returned to the frontend so the
 * animated constellation can change color mid-response.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM, type Tool, type Message, type ToolCall } from "../_core/llm";
import * as db from "../db";
import { nanoid } from "nanoid";
import { hasPermission, getCalendarVisibilityTier, canSeeVertical } from "./rbac";
import type { Permission } from "./rbac";

// ─── Tool Definitions ────────────────────────────────────────────────────────

const GEEVES_TOOLS: Tool[] = [
  // ── Calendar ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_upcoming_events",
      description: "Get the user's upcoming calendar events for the next N days. Use this when the user asks about their schedule, what's happening, meetings, appointments, or anything time-related.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days to look ahead. Default 7, max 30.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event. Use when the user asks to schedule, add, or create an event, meeting, appointment, or reminder.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          startIso: { type: "string", description: "Start date/time in ISO 8601 format, e.g. 2026-06-16T14:00:00" },
          endIso: { type: "string", description: "End date/time in ISO 8601 format" },
          description: { type: "string", description: "Optional event description" },
          location: { type: "string", description: "Optional location" },
          isAllDay: { type: "boolean", description: "True if this is an all-day event" },
        },
        required: ["title", "startIso", "endIso"],
        additionalProperties: false,
      },
    },
  },
  // ── Shopping ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_shopping_lists",
      description: "Get all active shopping lists with their item counts. Use when the user asks about shopping lists, groceries, errands, or what needs to be bought.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_list_items",
      description: "Get the items in a specific shopping list. Use when the user asks what's on a particular list.",
      parameters: {
        type: "object",
        properties: {
          listId: { type: "number", description: "The shopping list ID" },
        },
        required: ["listId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_item_to_list",
      description: "Add an item to a shopping list. Use when the user asks to add something to a list or says they need to buy something.",
      parameters: {
        type: "object",
        properties: {
          listId: { type: "number", description: "The shopping list ID to add to" },
          name: { type: "string", description: "Item name" },
          quantity: { type: "number", description: "Quantity, default 1" },
          notes: { type: "string", description: "Optional notes (brand, size, etc.)" },
        },
        required: ["listId", "name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_orders",
      description: "Get recent purchase orders from Walmart, Amazon, and other platforms. Use when the user asks about past orders, purchases, deliveries, or order history.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of orders to return, default 10, max 25" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── Finance ───────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_account_balances",
      description: "Get all bank account balances. Use when the user asks about their money, balances, accounts, or financial overview.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_transactions",
      description: "Get recent financial transactions. Use when the user asks about spending, recent purchases, expenses, or transactions.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of transactions to return, default 10, max 50" },
          classification: { type: "string", enum: ["personal", "business"], description: "Filter by personal or business expenses" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── Household ─────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_household_members",
      description: "Get all household members and their roles. Use when the user asks about family members, who's in the household, or member information.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_family_members",
      description: "Get family member profiles including clothing sizes and dietary restrictions. Use when the user asks about family preferences, sizes, or dietary needs.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── Notes ─────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_recent_notes",
      description: "Get recent notes saved in Geeves. Use when the user asks about notes, reminders, or saved information.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of notes to return, default 10" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── Shopping Sessions ─────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_shopping_sessions",
      description: "Get active shopping sessions (automated cart-filling sessions). Use when the user asks about shopping sessions, cart status, or automated shopping.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_shopping_session",
      description: "Cancel an active shopping session.",
      parameters: {
        type: "object",
        properties: {
          sessionId: { type: "number", description: "The session ID to cancel" },
        },
        required: ["sessionId"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Domain Detection ────────────────────────────────────────────────────────

const TOOL_DOMAIN_MAP: Record<string, string> = {
  get_upcoming_events: "calendar",
  create_calendar_event: "calendar",
  get_shopping_lists: "default",
  get_list_items: "default",
  add_item_to_list: "default",
  get_recent_orders: "default",
  get_account_balances: "finance",
  get_recent_transactions: "finance",
  get_household_members: "family",
  get_family_members: "family",
  get_recent_notes: "default",
  get_shopping_sessions: "default",
  cancel_shopping_session: "default",
};

// ─── RBAC Authorization Helper ────────────────────────────────────────────────

/**
 * RBAC gate for Geeves AI tools.
 * Returns { allowed: true } or { allowed: false; reason: string }.
 * Also returns the member record for use in the tool handler (avoiding double DB lookup).
 */
async function authorizeToolAccess(
  toolName: string,
  ctx: { user: { id: number; name?: string | null } }
): Promise<{ allowed: false; reason: string; member?: never } | { allowed: true; member: any }> {
  const member = await db.getHouseholdMemberByUserId(ctx.user.id);
  if (!member) return { allowed: false, reason: "No household found for this user." };

  // Gate 1: Check geevesAccess flag
  if (member.geevesAccess === false) {
    return { allowed: false, reason: "Geeves AI access is disabled for this account." };
  }

  // Gate 2: Check tool-specific permission
  const permissionMap: Record<string, Permission | null> = {
    get_upcoming_events: null,          // any calendar view permission works
    create_calendar_event: "calendar.edit",
    get_shopping_lists: null,
    get_list_items: null,
    add_item_to_list: null,
    get_recent_orders: null,
    get_account_balances: "finance.view",
    get_recent_transactions: "finance.view",
    get_household_members: "member.view_all",
    get_family_members: null,
    get_recent_notes: "notes.view_all", // also accepts notes.create — see below
    get_shopping_sessions: null,
    cancel_shopping_session: null,
  };

  const required = permissionMap[toolName];
  if (required && !hasPermission(member.role, required)) {
    return { allowed: false, reason: `Your role ('${member.role}') does not have permission to access this feature. Required: ${required}.` };
  }

  // Special case: get_upcoming_events needs at least one calendar view permission
  if (toolName === "get_upcoming_events") {
    const tier = getCalendarVisibilityTier(member.role);
    if (
      tier === "own" &&
      !hasPermission(member.role, "calendar.view_own")
    ) {
      return { allowed: false, reason: "Your role does not have calendar access permission." };
    }
  }

  // Special case: get_recent_notes — allow if user has notes.create (can see own) OR notes.view_all
  if (toolName === "get_recent_notes") {
    if (!hasPermission(member.role, "notes.view_all") && !hasPermission(member.role, "notes.create")) {
      return { allowed: false, reason: "Your role does not have note access permission." };
    }
  }

  return { allowed: true, member };
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { user: { id: number; name?: string | null } }
): Promise<string> {
  // CRITICAL FIX: RBAC authorization gate — checks geevesAccess flag, role permissions, and data policies
  const auth = await authorizeToolAccess(toolName, ctx);
  if (!auth.allowed) return auth.reason;
  const member = auth.member; // Pre-fetched member record for use in handlers (avoids double DB lookup)

  try {
    switch (toolName) {
      case "get_upcoming_events": {
        const days = Math.min(Number(args.days) || 7, 30);
        const now = Date.now();
        const end = now + days * 24 * 60 * 60 * 1000;
        const evts = await db.getEvents(member.householdId, now, end);
        if (!evts.length) return `No events in the next ${days} days.`;

        // Apply calendar visibility tier filtering based on role
        const tier = getCalendarVisibilityTier(member.role);
        let filteredEvts = evts;

        if (tier === "own") {
          // Only show events from calendars explicitly assigned to this member
          const memberCals = await db.getCalendarsByMember(member.id);
          const allowedCalIds = new Set(memberCals.map((c: any) => c.id));
          filteredEvts = evts.filter((e: any) => allowedCalIds.has(e.calendarId));
        } else if (tier === "vertical") {
          // Filter by vertical access rules: drop events on private verticals the member doesn't own,
          // and redact admin_only verticals to busy-only for non-admin/non-owner roles.
          const memberVerticalIds = new Set<number>();
          // Build set of verticals this member has access to (via their calendars)
          const memberCals = await db.getCalendarsByMember(member.id);
          for (const cal of memberCals) {
            if (cal.verticalId) memberVerticalIds.add(cal.verticalId);
          }
          filteredEvts = evts.filter((e: any) => {
            const cal = memberCals.find((c: any) => c.id === e.calendarId);
            const verticalPrivacy = cal?.verticalPrivacy || "household";
            const isVerticalOwner = cal?.verticalOwnerId === member.id;
            const visibility = canSeeVertical(member.role, verticalPrivacy, isVerticalOwner);
            return visibility !== "none";
          });
        }
        // tier === "all" (admin): no filtering needed — show everything

        if (!filteredEvts.length) return `No events in the next ${days} days.`;
        const formatted = filteredEvts.map((e: any) => {
          const start = new Date(e.startTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          return `- ${e.title} | ${start}${e.location ? ` @ ${e.location}` : ""}`;
        });
        return `Upcoming events (next ${days} days):\n${formatted.join("\n")}`;
      }

      case "create_calendar_event": {
        // Find the first synced calendar for this member
        const cals = await db.getCalendarsByMember(member.id);
        const syncedCal = cals.find((c: any) => c.verticalId && c.accessLevel === "read_write") || cals[0];
        if (!syncedCal) return "No calendar found to create the event in. Please connect a calendar in Settings first.";
        const startTime = new Date(args.startIso as string).getTime();
        const endTime = new Date(args.endIso as string).getTime();
        if (isNaN(startTime) || isNaN(endTime)) return "Invalid date/time format provided.";
        const id = nanoid();
        await db.createEvent({
          id,
          householdId: member.householdId,
          calendarId: syncedCal.id,
          title: args.title as string,
          description: (args.description as string) || null,
          location: (args.location as string) || null,
          startTime,
          endTime,
          isAllDay: Boolean(args.isAllDay),
          source: "manual",
          createdBy: member.id,
          lastModifiedBy: member.id,
        });
        return `Event "${args.title}" created on ${new Date(startTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} in calendar "${syncedCal.name}".`;
      }

      case "get_shopping_lists": {
        const lists = await db.getShoppingLists(ctx.user.id);
        if (!lists.length) return "No shopping lists found.";
        return lists.map((l: any) => `- "${l.name}" (ID: ${l.id}, ${l.itemCount || 0} items, status: ${l.status})`).join("\n");
      }

      case "get_list_items": {
        const items = await db.getShoppingListItems(Number(args.listId));
        if (!items.length) return "This list is empty.";
        return items.map((i: any) => `- ${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ""}${i.notes ? ` (${i.notes})` : ""}${i.isPurchased ? " ✓" : ""}`).join("\n");
      }

      case "add_item_to_list": {
        const list = await db.getShoppingListById(Number(args.listId), ctx.user.id);
        if (!list) return `Shopping list ID ${args.listId} not found.`;
        await db.createShoppingListItem({
          listId: Number(args.listId),
          name: args.name as string,
          quantity: Number(args.quantity) || 1,
          notes: (args.notes as string) || null,
          category: null,
          status: "pending" as const,
        });
        return `Added "${args.name}"${args.quantity && Number(args.quantity) > 1 ? ` x${args.quantity}` : ""} to "${list.name}".`;
      }

      case "get_recent_orders": {
        const limit = Math.min(Number(args.limit) || 10, 25);
        const orders = await db.getOrders(ctx.user.id, limit);
        if (!orders.length) return "No orders found.";
        return orders.map((o: any) => {
          const date = new Date(o.orderDate || o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          return `- ${o.platform || "Unknown"} order #${o.orderNumber || o.id} | ${date}${o.totalAmount ? ` | $${Number(o.totalAmount).toFixed(2)}` : ""}${o.status ? ` | ${o.status}` : ""}`;
        }).join("\n");
      }

      case "get_account_balances": {
        const accounts = await db.getBankAccountsByHousehold(member.householdId);
        if (!accounts.length) return "No bank accounts found.";
        return accounts.map((a: any) => `- ${a.institution} ${a.accountName} (${a.currency || "USD"}): ${a.currentBalance != null ? `$${Number(a.currentBalance).toFixed(2)}` : "Balance not set"}`).join("\n");
      }

      case "get_recent_transactions": {
        const limit = Math.min(Number(args.limit) || 10, 50);
        const filters: any = { limit };
        if (args.classification) filters.classification = args.classification;
        // Uses ctx.user.id (user-scoped) — finance.view permission already verified in authorizeToolAccess()
        const txns = await db.getTransactions(ctx.user.id, filters);
        if (!txns.length) return "No transactions found.";
        return txns.map((t: any) => {
          const date = new Date(t.date || t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return `- ${date} | ${t.merchant || t.description || "Unknown"} | $${Number(t.amount).toFixed(2)} | ${t.category || "Uncategorized"}${t.classification ? ` (${t.classification})` : ""}`;
        }).join("\n");
      }

      case "get_household_members": {
        const members = await db.getHouseholdMembers(member.householdId);
        // SECURITY: Filter out removed members before returning data to the AI chat
        const activeMembers = members.filter((m: any) => m.status !== "removed");
        if (!activeMembers.length) return "No household members found.";
        return activeMembers.map((m: any) => `- ${m.displayName} (${m.role})${m.email ? ` <${m.email}>` : ""}${m.status !== "active" ? ` [${m.status}]` : ""}`).join("\n");
      }

      case "get_family_members": {
        const family = await db.getFamilyMembers(ctx.user.id);
        if (!family.length) return "No family members found.";
        return family.map((f: any) => {
          const details = [];
          if (f.relationship) details.push(f.relationship);
          if (f.dietaryRestrictions) details.push(`diet: ${f.dietaryRestrictions}`);
          return `- ${f.name}${details.length ? ` (${details.join(", ")})` : ""}`;
        }).join("\n");
      }

      case "get_recent_notes": {
        const limit = Math.min(Number(args.limit) || 10, 20);
        const notes = await db.getNotes(member.householdId);
        // SECURITY: If member only has notes.create (not notes.view_all), filter to notes they created
        const canViewAll = hasPermission(member.role, "notes.view_all");
        const visibleNotes = canViewAll ? notes : notes.filter((n: any) => n.createdBy === member.id);
        const recent = visibleNotes.slice(0, limit);
        if (!recent.length) return "No notes found.";
        return recent.map((n: any) => {
          const date = new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return `- [${date}] ${n.content.slice(0, 120)}${n.content.length > 120 ? "…" : ""}`;
        }).join("\n");
      }

      case "get_shopping_sessions": {
        const sessions = await db.getShoppingSessions(ctx.user.id);
        const active = sessions.filter((s: any) => !["completed", "cancelled"].includes(s.status));
        if (!active.length) return "No active shopping sessions.";
        return active.map((s: any) => `- Session #${s.id} "${s.listName}" | status: ${s.status} | ${s.totalItems} items`).join("\n");
      }

      case "cancel_shopping_session": {
        const session = await db.getShoppingSession(Number(args.sessionId), ctx.user.id);
        if (!session) return `Session #${args.sessionId} not found.`;
        if (["completed", "cancelled"].includes(session.status)) return `Session #${args.sessionId} is already ${session.status}.`;
        await db.updateShoppingSession(Number(args.sessionId), { status: "cancelled" });
        return `Session #${args.sessionId} ("${session.listName}") has been cancelled.`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err: any) {
    return `Tool error: ${err.message}`;
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(userName: string): string {
  const now = new Date().toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `You are Geeves, a sophisticated and warm personal life management assistant — like a trusted butler who genuinely cares. You manage the household's calendar, shopping, finances, and daily life.

Current date/time: ${now}
User: ${userName}

You have access to tools that let you actually look up and act on real data. Use them proactively — don't just describe what you could do, do it. When the user asks about their schedule, call get_upcoming_events. When they mention needing something, call get_shopping_lists first, then add_item_to_list.

Guidelines:
- Be concise, warm, and actionable. Use markdown for structure.
- When you use a tool and get results, summarise them naturally — don't just dump raw data.
- If you need multiple pieces of information, chain tool calls (you can call up to 5 tools per response).
- For calendar events, always confirm what you created and in which calendar.
- When referencing app pages, use markdown links: [Calendar](/calendar), [Shopping](/shopping), [Finances](/accounts), [Orders](/orders).
- Be honest about limitations — you cannot browse the web or log into external sites.
- If the user asks for something that requires a page in the app, link them there.`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const geevesRouter = router({
  history: protectedProcedure.query(async ({ ctx }) => {
    return db.getChatMessages(ctx.user.id, 50);
  }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await db.clearChatHistory(ctx.user.id);
    return { success: true };
  }),

  chat: protectedProcedure.input(z.object({
    message: z.string().min(1).max(4000),
  })).mutation(async ({ ctx, input }) => {
    // Save user message
    await db.addChatMessage({
      userId: ctx.user.id,
      role: "user",
      content: input.message,
    });

    // Load recent history for context (last 16 messages)
    const recentMessages = await db.getChatMessages(ctx.user.id, 18);
    const historyMessages: Message[] = recentMessages
      .slice(0, -1) // exclude the message we just saved
      .slice(-16)
      .filter((m: any) => m.role !== "system")
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Build the conversation
    const messages: Message[] = [
      { role: "system", content: buildSystemPrompt(ctx.user.name || "there") },
      ...historyMessages,
      { role: "user", content: input.message },
    ];

    // ── Agentic Loop (up to 5 iterations) ────────────────────────────────────
    let detectedDomain = "default";
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await invokeLLM({
        messages,
        tools: GEEVES_TOOLS,
        toolChoice: "auto",
      });

      const choice = response.choices?.[0];
      if (!choice) break;

      const { message } = choice;

      // If no tool calls, we have the final answer
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const rawContent = message.content;
        const assistantContent = typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")
            : "I'm having trouble responding right now. Please try again.";

        await db.addChatMessage({
          userId: ctx.user.id,
          role: "assistant",
          content: assistantContent,
          metadata: { domain: detectedDomain, iterations },
        });

        return {
          role: "assistant" as const,
          content: assistantContent,
          domain: detectedDomain,
        };
      }

      // Add the assistant's tool-call message to the conversation
      messages.push({
        role: "assistant",
        content: message.content || "",
        tool_calls: message.tool_calls,
      } as any);

      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          toolArgs = {};
        }

        // Detect domain from first tool called
        if (detectedDomain === "default" && TOOL_DOMAIN_MAP[toolName]) {
          detectedDomain = TOOL_DOMAIN_MAP[toolName];
        }

        const toolResult = await executeTool(toolName, toolArgs, ctx);

        // Add tool result to conversation
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        } as any);
      }
    }

    // Fallback if max iterations reached
    const fallback = "I've gathered the information but ran into a processing limit. Please try rephrasing your question.";
    await db.addChatMessage({
      userId: ctx.user.id,
      role: "assistant",
      content: fallback,
      metadata: { domain: detectedDomain, iterations, maxIterationsReached: true },
    });

    return {
      role: "assistant" as const,
      content: fallback,
      domain: detectedDomain,
    };
  }),
});
