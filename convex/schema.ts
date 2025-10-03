import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  // Customize Convex Auth users table per docs:
  // https://labs.convex.dev/auth/setup/schema
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Custom fields
    fullName: v.optional(v.string()),
    specialization: v.optional(v.string()),
  }).index("email", ["email"]),
  numbers: defineTable({
    value: v.number(),
  }),
  quizzes: defineTable({
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    delaySeconds: v.number(),
    createdBy: v.optional(v.id("users")),
    productPlacement: v.optional(
      v.object({
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        logoUrl: v.optional(v.string()),
        logoStorageId: v.optional(v.id("_storage")),
        imageUrl: v.optional(v.string()),
        imageStorageId: v.optional(v.id("_storage")),
      })
    ),
    forcePreview: v.optional(v.boolean()),
  }).index("by_createdBy", ["createdBy"]),

  quizQuestions: defineTable({
    quizId: v.id("quizzes"),
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    answerTimeSec: v.number(),
    allowsMultiple: v.boolean(),
    order: v.number(),
  })
    .index("by_quiz", ["quizId"]) 
    .index("by_quiz_order", ["quizId", "order"]),

  questionOptions: defineTable({
    questionId: v.id("quizQuestions"),
    text: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    isCorrect: v.boolean(),
  }).index("by_question", ["questionId"]),

  quizSessions: defineTable({
    quizId: v.id("quizzes"),
    status: v.union(
      v.literal("waiting"),
      v.literal("question"),
      v.literal("finished")
    ),
    startedAt: v.number(), // ms since epoch
    delaySeconds: v.number(),
    currentQuestionIndex: v.number(),
    currentQuestionId: v.optional(v.id("quizQuestions")),
    questionStartedAt: v.optional(v.number()),
    questionEndsAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_quiz", ["quizId"]) 
    .index("by_status", ["status"]) 
    .index("by_quiz_status", ["quizId", "status"]),

  userAnswers: defineTable({
    sessionId: v.id("quizSessions"),
    questionId: v.id("quizQuestions"),
    userId: v.id("users"),
    selectedOptionIds: v.array(v.id("questionOptions")),
    isCorrect: v.boolean(),
    answeredAt: v.number(),
  })
    .index("by_session_question", ["sessionId", "questionId"]) 
    .index("by_session", ["sessionId"]) 
    .index("by_session_user", ["sessionId", "userId"]) 
    .index("by_question_user", ["questionId", "userId"]),

  sessionScores: defineTable({
    sessionId: v.id("quizSessions"),
    userId: v.id("users"),
    correctCount: v.number(),
  })
    .index("by_session", ["sessionId"]) 
    .index("by_session_user", ["sessionId", "userId"]) 
    .index("by_session_correctCount", ["sessionId", "correctCount"]),

  // Chat subsystem
  chatTickets: defineTable({
    // user who asked
    userId: v.id("users"),
    // original user question text
    userQuestion: v.string(),
    // raw model answer from external API (before moderation)
    modelAnswer: v.optional(v.string()),
    // edited by moderator fields
    modQuestion: v.optional(v.string()),
    modAnswer: v.optional(v.string()),
    // status lifecycle
    status: v.union(
      v.literal("queued"), // awaiting external API response or moderation
      v.literal("awaiting_moderation"), // has model answer, waiting for mod
      v.literal("approved"), // approved and published to history
      v.literal("deleted") // removed by moderator
    ),
  })
    .index("by_status", ["status"]) // for moderator queue
    .index("by_user_status", ["userId", "status"]) // to show user state
    .index("by_user", ["userId"]),

  chatHistory: defineTable({
    // flattened approved pairs for public chat history
    userId: v.id("users"),
    question: v.string(),
    answer: v.string(),
    // reference back to ticket
    ticketId: v.id("chatTickets"),
  })
    .index("by_ticket", ["ticketId"]) 
    .index("by_user", ["userId"]),

  // Sources extracted from AI context for a ticket
  chatSources: defineTable({
    ticketId: v.id("chatTickets"),
    url: v.string(),
    title: v.optional(v.string()),
    snippet: v.optional(v.string()),
  }).index("by_ticket", ["ticketId"]),

  // Chat promo phrases and settings
  chatPhrases: defineTable({
    text: v.string(),
    visible: v.boolean(),
    durationMs: v.number(),
    order: v.number(),
  }).index("by_order", ["order"]),

  chatSettings: defineTable({
    intervalMs: v.number(),
    randomize: v.optional(v.boolean()),
  }),

  chatAnnouncements: defineTable({
    text: v.string(),
    durationMs: v.number(),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),
});
