import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

// 1) User submits a question -> create ticket in queued
export const submitQuestion = mutation({
  args: {
    userQuestion: v.string(),
  },
  returns: v.id("chatTickets"),
  handler: async (ctx, args) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!userId) throw new Error("Unauthorized");
    const ticketId = await ctx.db.insert("chatTickets", {
      userId,
      userQuestion: args.userQuestion,
      status: "queued",
    });
    // Call external AI action to fetch an answer & sources, then set awaiting_moderation
    await ctx.scheduler.runAfter(0, internal.chat.callExternalAi, { ticketId });
    return ticketId;
  },
});

// 2) Position in queue for a user: count queued tickets created earlier
export const getQueuePosition = query({
  args: {
    ticketId: v.optional(v.id("chatTickets")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!args.ticketId) return 0;
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return 0;
    if (ticket.status !== "queued") return 0;
    // naive position: count queued with _creationTime <= current
    let position = 1;
    for await (const t of ctx.db
      .query("chatTickets")
      .withIndex("by_status", (q) => q.eq("status", "queued"))) {
      if (t._creationTime < ticket._creationTime) position += 1;
    }
    return position;
  },
});

// Internal: simulate external API returning an answer and move to awaiting_moderation
export const simulateExternalAnswer = internalMutation({
  args: { ticketId: v.id("chatTickets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.status !== "queued") return null;
    // fake latency
    // Note: scheduler already async; no sleep utility so we do second hop action
    await ctx.scheduler.runAfter(2000, internal.chat.writeModelAnswer, {
      ticketId: args.ticketId,
      modelAnswer: `Симулированный ответ на: "${ticket.userQuestion}"`,
    });
    return null;
  },
});

export const writeModelAnswer = internalMutation({
  args: { ticketId: v.id("chatTickets"), modelAnswer: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket || ticket.status !== "queued") return null;
    await ctx.db.patch(args.ticketId, {
      modelAnswer: args.modelAnswer,
      status: "awaiting_moderation",
    });
    return null;
  },
});

// Action: call external AI API and store answer + sources
export const callExternalAi = internalAction({
  args: { ticketId: v.id("chatTickets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ticket = await ctx.runQuery(internal.chat._getTicket, { ticketId: args.ticketId });
    if (!ticket || ticket.status !== "queued") return null;

    // Prepare body
    const body = {
      agentpackVersionRef: { projectId: "ks7dfr0m9vghhyjhrgqwd6f6en7j0ser" },
      userMessage: ticket.userQuestion,
      threadRef: {
        userExternalId: String(ticket.userId),
        threadExternalId: "drsarha_conf",
        agentExternalId: "Сара",
        agentpackAgentRef: "agent_ibvnqxjh",
      },
    };
    try {
      const res = await fetch("https://ai-studio-dsl.cnv.reflectai.pro/createRun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      console.log("AI call status:", res.status, res.statusText);
      const json = await res.json();
      console.log("AI json top-level keys:", Object.keys(json ?? {}));
      // Parse basicLog.finalText
      const finalText: string | undefined = json?.runId?.basicLog?.finalText;
      console.log("AI finalText present:", Boolean(finalText));
      if (finalText) {
        await ctx.runMutation(internal.chat._patchTicketAwaiting, {
          ticketId: args.ticketId,
          modelAnswer: finalText,
        });
      }

      // Extract sources from AdditionalContextFromRag embedded in messages if present
      const msgs: Array<any> | undefined = json?.messages ?? json?.runId?.messages;
      console.log("AI messages length:", Array.isArray(msgs) ? msgs.length : "none");
      const sourceBlobs: Array<string> = [];
      function extractArraysFromContent(content: string): string[] {
        const arrays: string[] = [];
        let searchPos = 0;
        while (true) {
          const tagPos = content.indexOf("<AdditionalContextFromRag>", searchPos);
          if (tagPos === -1) break;
          const openPos = content.indexOf("[", tagPos);
          if (openPos === -1) {
            searchPos = tagPos + 1;
            continue;
          }
          let depth = 0;
          let inString = false;
          let escape = false;
          let endPos = -1;
          for (let i = openPos; i < content.length; i++) {
            const ch = content[i];
            if (escape) {
              escape = false;
              continue;
            }
            if (ch === "\\") {
              escape = true;
              continue;
            }
            if (ch === '"') {
              inString = !inString;
              continue;
            }
            if (!inString) {
              if (ch === "[") depth++;
              else if (ch === "]") {
                depth--;
                if (depth === 0) {
                  endPos = i;
                  break;
                }
              }
            }
          }
          if (endPos !== -1) {
            arrays.push(content.slice(openPos, endPos + 1));
            searchPos = endPos + 1;
          } else {
            // couldn't find matching bracket
            searchPos = tagPos + 1;
          }
        }
        return arrays;
      }
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          const content: string = m?.content ?? "";
          if (typeof content === "string" && content.includes("AdditionalContextFromRag")) {
            const found = extractArraysFromContent(content);
            console.log("Found AdditionalContextFromRag arrays via bracket scan:", found.length);
            sourceBlobs.push(...found);
          }
        }
      }

      console.log("Total extracted source arrays:", sourceBlobs.length);
      let inserted = 0;
      for (const blob of sourceBlobs) {
        try {
          const arr = JSON.parse(blob);
          console.log("Parsed sources array length:", Array.isArray(arr) ? arr.length : "not array");
          if (Array.isArray(arr)) {
            for (const it of arr) {
              if (typeof it === "string") {
                const urlMatches = it.match(/https?:\/\/[^\s"')]+/g) ?? [];
                for (const u of urlMatches) {
                  await ctx.runMutation(internal.chat._insertSource, {
                    ticketId: args.ticketId,
                    url: u,
                    title: null,
                    snippet: it.slice(0, 800),
                  });
                  inserted++;
                }
              } else if (it && typeof it === "object") {
                const url: string | undefined = (it as any)?.id ?? (it as any)?.url;
                const text: string | undefined = (it as any)?.metadata?.text ?? (it as any)?.text;
                if (url) {
                  await ctx.runMutation(internal.chat._insertSource, {
                    ticketId: args.ticketId,
                    url,
                    title: null,
                    snippet: typeof text === "string" ? text.slice(0, 800) : null,
                  });
                  inserted++;
                }
              }
            }
          }
        } catch (e) {
          console.log("Failed to parse sources blob:", String(e).slice(0, 200));
        }
      }
      console.log("Inserted sources count:", inserted);

      if (!finalText) {
        // Fall back to simulated answer if API didn't return
        await ctx.runMutation(internal.chat._patchTicketAwaiting, {
          ticketId: args.ticketId,
          modelAnswer: `Симулированный ответ на: "${ticket.userQuestion}"`,
        });
      }
    } catch (e) {
      console.log("AI call failed:", String(e).slice(0, 200));
      await ctx.runMutation(internal.chat._patchTicketAwaiting, {
        ticketId: args.ticketId,
        modelAnswer: `Симулированный ответ на: "${ticket.userQuestion}"`,
      });
    }
    return null;
  },
});

// Internal helpers for action to use (since actions can't use ctx.db directly)
export const _getTicket = internalQuery({
  args: { ticketId: v.id("chatTickets") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("chatTickets"),
      _creationTime: v.number(),
      userId: v.id("users"),
      userQuestion: v.string(),
      modelAnswer: v.optional(v.string()),
      modQuestion: v.optional(v.string()),
      modAnswer: v.optional(v.string()),
      status: v.union(
        v.literal("queued"),
        v.literal("awaiting_moderation"),
        v.literal("approved"),
        v.literal("deleted")
      ),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.ticketId);
  },
});

export const _patchTicketAwaiting = internalMutation({
  args: { ticketId: v.id("chatTickets"), modelAnswer: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ticketId, {
      modelAnswer: args.modelAnswer,
      status: "awaiting_moderation",
    });
    return null;
  },
});

export const _insertSource = internalMutation({
  args: {
    ticketId: v.id("chatTickets"),
    url: v.string(),
    title: v.union(v.string(), v.null()),
    snippet: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("chatSources", {
      ticketId: args.ticketId,
      url: args.url,
      title: args.title ?? undefined,
      snippet: args.snippet ?? undefined,
    });
    return null;
  },
});

// 3) Moderator: list awaiting tickets in FIFO order
export const listAwaiting = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("chatTickets"),
      _creationTime: v.number(),
      userId: v.id("users"),
      userQuestion: v.string(),
      modelAnswer: v.optional(v.string()),
      modQuestion: v.optional(v.string()),
      modAnswer: v.optional(v.string()),
      status: v.union(
        v.literal("queued"),
        v.literal("awaiting_moderation"),
        v.literal("approved"),
        v.literal("deleted")
      ),
    })
  ),
  handler: async (ctx) => {
    const results = await ctx.db
      .query("chatTickets")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_moderation"))
      .order("asc")
      .collect();
    return results;
  },
});

// 4) Moderator: update fields (question/answer)
export const modUpdate = mutation({
  args: {
    ticketId: v.id("chatTickets"),
    modQuestion: v.optional(v.string()),
    modAnswer: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // TODO: auth check for moderator later
    await ctx.db.patch(args.ticketId, {
      ...(args.modQuestion !== undefined ? { modQuestion: args.modQuestion } : {}),
      ...(args.modAnswer !== undefined ? { modAnswer: args.modAnswer } : {}),
    });
    return null;
  },
});

// 5) Moderator: delete ticket
export const modDelete = mutation({
  args: { ticketId: v.id("chatTickets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ticketId, { status: "deleted" });
    return null;
  },
});

// 6) Moderator: approve and publish to history
export const modApprove = mutation({
  args: { ticketId: v.id("chatTickets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.ticketId);
    if (!t) throw new Error("Ticket not found");
    const question = t.modQuestion ?? t.userQuestion;
    const answer = t.modAnswer ?? t.modelAnswer ?? "";
    if (!answer) throw new Error("Нет ответа для публикации");
    await ctx.db.insert("chatHistory", {
      userId: t.userId,
      question,
      answer,
      ticketId: t._id,
    });
    await ctx.db.patch(args.ticketId, { status: "approved" });
    return null;
  },
});

// 7) History list (public)
export const listHistory = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("chatHistory"),
      _creationTime: v.number(),
      userId: v.id("users"),
      question: v.string(),
      answer: v.string(),
      ticketId: v.id("chatTickets"),
    })
  ),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("chatHistory")
      .order("desc")
      .take(Math.max(1, Math.min(50, args.limit ?? 20)));
    return items;
  },
});

// 8) For user: get latest active ticket for state (queue vs ready)
export const getUserActiveTicket = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      ticketId: v.id("chatTickets"),
      status: v.string(),
    })
  ),
  handler: async (ctx) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!userId) return null;
    const tickets = await ctx.db
      .query("chatTickets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);
    const t = tickets[0];
    if (!t) return null;
    return { ticketId: t._id, status: t.status } as const;
  },
});

// 9) Admin & client: phrases CRUD
export const listPhrases = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("chatPhrases"),
      text: v.string(),
      visible: v.boolean(),
      durationMs: v.number(),
      order: v.number(),
    })
  ),
  handler: async (ctx) => {
    const items = await ctx.db
      .query("chatPhrases")
      .withIndex("by_order", (q) => q.gt("order", -1))
      .order("asc")
      .collect();
    return items.map((p: any) => ({
      _id: p._id,
      text: p.text,
      visible: p.visible,
      durationMs: p.durationMs,
      order: p.order,
    }));
  },
});

export const upsertPhrase = mutation({
  args: {
    phraseId: v.optional(v.id("chatPhrases")),
    text: v.string(),
    visible: v.boolean(),
    durationMs: v.number(),
    order: v.number(),
  },
  returns: v.id("chatPhrases"),
  handler: async (ctx, args) => {
    if (args.phraseId) {
      await ctx.db.patch(args.phraseId, {
        text: args.text,
        visible: args.visible,
        durationMs: args.durationMs,
        order: args.order,
      });
      return args.phraseId;
    }
    const id = await ctx.db.insert("chatPhrases", {
      text: args.text,
      visible: args.visible,
      durationMs: args.durationMs,
      order: args.order,
    });
    return id;
  },
});

export const deletePhrase = mutation({
  args: { phraseId: v.id("chatPhrases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.phraseId);
    return null;
  },
});

// 10) Settings
export const getSettings = query({
  args: {},
  returns: v.union(v.null(), v.object({ _id: v.id("chatSettings"), intervalMs: v.number(), randomize: v.optional(v.boolean()) })),
  handler: async (ctx) => {
    const s = await ctx.db.query("chatSettings").order("asc").take(1);
    const it = s[0];
    return it ? { _id: it._id, intervalMs: it.intervalMs, randomize: it.randomize } : null;
  },
});

export const setSettings = mutation({
  args: { intervalMs: v.number(), randomize: v.optional(v.boolean()) },
  returns: v.id("chatSettings"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("chatSettings").order("asc").take(1);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, { intervalMs: args.intervalMs, ...(args.randomize !== undefined ? { randomize: args.randomize } : {}) });
      return existing[0]._id;
    }
    return await ctx.db.insert("chatSettings", { intervalMs: args.intervalMs, randomize: args.randomize ?? false });
  },
});

// 11) Announcements: show now (enqueue one-time display)
export const showNow = mutation({
  args: { text: v.string(), durationMs: v.number() },
  returns: v.id("chatAnnouncements"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("chatAnnouncements", {
      text: args.text,
      durationMs: args.durationMs,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const nextAnnouncement = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ _id: v.id("chatAnnouncements"), text: v.string(), durationMs: v.number() })
  ),
  handler: async (ctx) => {
    const items = await ctx.db
      .query("chatAnnouncements")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", 0))
      .order("asc")
      .take(1);
    const it = items[0];
    return it ? { _id: it._id, text: it.text, durationMs: it.durationMs } : null;
  },
});

export const consumeAnnouncement = mutation({
  args: { id: v.id("chatAnnouncements") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});


