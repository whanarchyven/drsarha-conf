import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
export const upsertProfile = mutation({
  args: {
    fullName: v.string(),
    phone: v.string(),
    specialization: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Требуется авторизация");
    await ctx.db.patch(userId, {
      fullName: args.fullName,
      phone: args.phone,
      specialization: args.specialization,
    } as any);
    return null;
  },
});

// Utilities
async function ensureAdmin(ctx: any): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Требуется авторизация");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Пользователь не найден");
  if (user.email !== "admin@mail.com") throw new Error("Доступ запрещен");
}

function omitUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

export const currentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ _id: v.id("users"), email: v.string() })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { _id: user._id, email: user.email } as any;
  },
});

// Quiz CRUD
export const listQuizzes = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("quizzes"),
      _creationTime: v.number(),
      title: v.string(),
      description: v.string(),
      imageUrl: v.optional(v.string()),
      delaySeconds: v.number(),
      sessionStatus: v.optional(
        v.union(v.literal("waiting"), v.literal("question"), v.literal("finished"))
      ),
      sessionId: v.optional(v.id("quizSessions")),
    })
  ),
  handler: async (ctx) => {
    const quizzes = await ctx.db.query("quizzes").order("desc").take(100);
    return Promise.all(
      quizzes.map(async (q: any) => {
        const latestSession = await ctx.db
          .query("quizSessions")
          .withIndex("by_quiz", (qq: any) => qq.eq("quizId", q._id))
          .order("desc")
          .take(1);
        const s = latestSession[0];
        return {
          _id: q._id,
          _creationTime: q._creationTime,
          title: q.title,
          description: q.description,
          imageUrl: q.imageStorageId ? await ctx.storage.getUrl(q.imageStorageId) : q.imageUrl,
          delaySeconds: q.delaySeconds,
          sessionStatus: s?.status,
          sessionId: s?._id,
        };
      })
    );
  },
});

export const getQuiz = query({
  args: { quizId: v.id("quizzes") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("quizzes"),
      title: v.string(),
      description: v.string(),
      imageUrl: v.optional(v.string()),
      imageStorageId: v.optional(v.id("_storage")),
      delaySeconds: v.number(),
      productPlacement: v.optional(
        v.object({
          name: v.optional(v.string()),
          description: v.optional(v.string()),
          logoUrl: v.optional(v.string()),
          imageUrl: v.optional(v.string()),
        })
      ),
      questions: v.array(
        v.object({
          _id: v.id("quizQuestions"),
          title: v.string(),
          description: v.string(),
          imageUrl: v.optional(v.string()),
          imageStorageId: v.optional(v.id("_storage")),
          answerTimeSec: v.number(),
          allowsMultiple: v.boolean(),
          order: v.number(),
          options: v.array(
            v.object({
              _id: v.id("questionOptions"),
              text: v.string(),
              imageUrl: v.optional(v.string()),
              imageStorageId: v.optional(v.id("_storage")),
              isCorrect: v.boolean(),
            })
          ),
        })
      ),
    })
  ),
  handler: async (ctx, { quizId }) => {
    const quiz = await ctx.db.get(quizId);
    if (!quiz) return null;
    const quizImageSigned = quiz.imageStorageId
      ? await ctx.storage.getUrl(quiz.imageStorageId)
      : quiz.imageUrl;
    // product placement signed urls
    let productPlacement: any | undefined = undefined;
    if (quiz.productPlacement) {
      const logoUrl = quiz.productPlacement.logoStorageId
        ? await ctx.storage.getUrl(quiz.productPlacement.logoStorageId)
        : quiz.productPlacement.logoUrl;
      const imageUrl = quiz.productPlacement.imageStorageId
        ? await ctx.storage.getUrl(quiz.productPlacement.imageStorageId)
        : quiz.productPlacement.imageUrl;
      productPlacement = {
        name: quiz.productPlacement.name,
        description: quiz.productPlacement.description,
        logoUrl: logoUrl ?? quiz.productPlacement.logoUrl,
        imageUrl: imageUrl ?? quiz.productPlacement.imageUrl,
      };
    }
    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz_order", (q: any) => q.eq("quizId", quizId))
      .order("asc")
      .collect();
    const questionsWithOptions = [] as Array<any>;
    for (const q of questions) {
      const options = await ctx.db
        .query("questionOptions")
        .withIndex("by_question", (qq: any) => qq.eq("questionId", q._id))
        .collect();
      const sanitizedOptions = options.map((o: any) => ({
        _id: o._id,
        text: o.text,
        imageUrl: o.imageUrl,
        imageStorageId: o.imageStorageId,
        isCorrect: o.isCorrect,
      }));
      const qImageSigned = q.imageStorageId
        ? await ctx.storage.getUrl(q.imageStorageId)
        : q.imageUrl;
      questionsWithOptions.push({
        _id: q._id,
        title: q.title,
        description: q.description,
        imageUrl: qImageSigned ?? q.imageUrl,
        imageStorageId: q.imageStorageId,
        answerTimeSec: q.answerTimeSec,
        allowsMultiple: q.allowsMultiple,
        order: q.order,
        options: sanitizedOptions,
      });
    }
    return {
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      imageUrl: quizImageSigned ?? quiz.imageUrl,
      imageStorageId: quiz.imageStorageId,
      delaySeconds: quiz.delaySeconds,
      productPlacement,
      questions: questionsWithOptions,
    };
  },
});

export const createQuiz = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    delaySeconds: v.number(),
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
  },
  returns: v.id("quizzes"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const userId = await getAuthUserId(ctx);
    const id = await ctx.db.insert("quizzes", {
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      imageStorageId: args.imageStorageId,
      delaySeconds: args.delaySeconds,
      createdBy: userId ?? undefined,
      productPlacement: args.productPlacement,
    });
    return id;
  },
});

export const updateQuiz = mutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    delaySeconds: v.number(),
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const quiz = await ctx.db.get(args.quizId);
    if (!quiz) throw new Error("Квиз не найден");
    // Аккуратно мержим productPlacement, чтобы не затереть storageId при частичных апдейтах
    const mergedProductPlacement = args.productPlacement
      ? { ...(quiz.productPlacement ?? {}), ...args.productPlacement }
      : quiz.productPlacement;
    const patch = omitUndefined({
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      imageStorageId: args.imageStorageId,
      delaySeconds: args.delaySeconds,
      forcePreview: args.forcePreview,
    }) as any;
    if (mergedProductPlacement !== undefined) {
      patch.productPlacement = mergedProductPlacement;
    }
    console.log("[updateQuiz]", {
      quizId: args.quizId,
      incoming: {
        title: args.title,
        description: args.description,
        hasImageUrl: args.imageUrl !== undefined,
        hasImageStorageId: args.imageStorageId !== undefined,
        delaySeconds: args.delaySeconds,
        productPlacement: args.productPlacement,
        forcePreview: args.forcePreview,
      },
      mergedProductPlacement,
      patch,
    });
    await ctx.db.patch(args.quizId, patch);
    return null;
  },
});

export const deleteQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  returns: v.null(),
  handler: async (ctx, { quizId }) => {
    await ensureAdmin(ctx);
    // Cascade delete questions, options, sessions, answers, scores
    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz", (q: any) => q.eq("quizId", quizId))
      .collect();
    for (const q of questions) {
      const options = await ctx.db
        .query("questionOptions")
        .withIndex("by_question", (qq: any) => qq.eq("questionId", q._id))
        .collect();
      for (const o of options) await ctx.db.delete(o._id);
      await ctx.db.delete(q._id);
    }
    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q: any) => q.eq("quizId", quizId))
      .collect();
    for (const s of sessions) {
      const answers = await ctx.db
        .query("userAnswers")
        .withIndex("by_session", (q: any) => q.eq("sessionId", s._id))
        .collect();
      for (const a of answers) await ctx.db.delete(a._id);
      const scores = await ctx.db
        .query("sessionScores")
        .withIndex("by_session", (q: any) => q.eq("sessionId", s._id))
        .collect();
      for (const sc of scores) await ctx.db.delete(sc._id);
      await ctx.db.delete(s._id);
    }
    await ctx.db.delete(quizId);
    return null;
  },
});

// Admin reset: remove all sessions, answers, scores for a quiz
export const resetQuizSessions = mutation({
  args: { quizId: v.id("quizzes") },
  returns: v.null(),
  handler: async (ctx, { quizId }) => {
    await ensureAdmin(ctx);
    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q: any) => q.eq("quizId", quizId))
      .collect();
    for (const s of sessions) {
      // delete answers
      const answers = await ctx.db
        .query("userAnswers")
        .withIndex("by_session", (q: any) => q.eq("sessionId", s._id))
        .collect();
      for (const a of answers) await ctx.db.delete(a._id);
      // delete scores
      const scores = await ctx.db
        .query("sessionScores")
        .withIndex("by_session", (q: any) => q.eq("sessionId", s._id))
        .collect();
      for (const sc of scores) await ctx.db.delete(sc._id);
      // delete session
      await ctx.db.delete(s._id);
    }
    return null;
  },
});

// Questions & Options CRUD
export const addQuestion = mutation({
  args: {
    quizId: v.id("quizzes"),
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    answerTimeSec: v.number(),
    allowsMultiple: v.boolean(),
    order: v.number(),
  },
  returns: v.id("quizQuestions"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const id = await ctx.db.insert("quizQuestions", args);
    return id;
  },
});

export const updateQuestion = mutation({
  args: {
    questionId: v.id("quizQuestions"),
    title: v.string(),
    description: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    answerTimeSec: v.number(),
    allowsMultiple: v.boolean(),
    order: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    await ctx.db.patch(args.questionId, {
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      imageStorageId: args.imageStorageId,
      answerTimeSec: args.answerTimeSec,
      allowsMultiple: args.allowsMultiple,
      order: args.order,
    });
    return null;
  },
});

export const deleteQuestion = mutation({
  args: { questionId: v.id("quizQuestions") },
  returns: v.null(),
  handler: async (ctx, { questionId }) => {
    await ensureAdmin(ctx);
    const options = await ctx.db
      .query("questionOptions")
      .withIndex("by_question", (q: any) => q.eq("questionId", questionId))
      .collect();
    for (const o of options) await ctx.db.delete(o._id);
    await ctx.db.delete(questionId);
    return null;
  },
});

export const addOption = mutation({
  args: {
    questionId: v.id("quizQuestions"),
    text: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    isCorrect: v.boolean(),
  },
  returns: v.id("questionOptions"),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    const id = await ctx.db.insert("questionOptions", args);
    return id;
  },
});

export const updateOption = mutation({
  args: {
    optionId: v.id("questionOptions"),
    text: v.string(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    isCorrect: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAdmin(ctx);
    await ctx.db.patch(args.optionId, {
      text: args.text,
      imageUrl: args.imageUrl,
      imageStorageId: args.imageStorageId,
      isCorrect: args.isCorrect,
    });
    return null;
  },
});

export const deleteOption = mutation({
  args: { optionId: v.id("questionOptions") },
  returns: v.null(),
  handler: async (ctx, { optionId }) => {
    await ensureAdmin(ctx);
    await ctx.db.delete(optionId);
    return null;
  },
});

// Sessions and gameplay
export const startQuiz = mutation({
  args: { quizId: v.id("quizzes") },
  returns: v.id("quizSessions"),
  handler: async (ctx, { quizId }) => {
    await ensureAdmin(ctx);
    const quiz = await ctx.db.get(quizId);
    if (!quiz) throw new Error("Квиз не найден");
    console.log("[startQuiz] requested", { quizId });
    // Close any existing active sessions
    const active = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz_status", (q: any) => q.eq("quizId", quizId).eq("status", "waiting"))
      .collect();
    for (const s of active) await ctx.db.patch(s._id, { status: "finished", finishedAt: Date.now() });

    const now = Date.now();
    const sessionId = await ctx.db.insert("quizSessions", {
      quizId,
      status: "waiting",
      startedAt: now,
      delaySeconds: quiz.delaySeconds,
      currentQuestionIndex: -1,
      currentQuestionId: undefined,
      questionStartedAt: undefined,
      questionEndsAt: undefined,
      finishedAt: undefined,
    });
    // Ensure preview не зафиксирован в режиме QR
    if (quiz.forcePreview) {
      await ctx.db.patch(quizId, { forcePreview: false });
    }
    // schedule transition to first question after delay
    const runAt = now + quiz.delaySeconds * 1000;
    await ctx.scheduler.runAt(runAt, internal.quiz.progressSession, { sessionId });
    console.log("[startQuiz] session created", { sessionId, runAt });
    return sessionId;
  },
});

export const getPublicSessionState = query({
  args: { quizId: v.id("quizzes") },
  returns: v.union(
    v.null(),
    v.object({
      sessionId: v.id("quizSessions"),
      status: v.union(v.literal("waiting"), v.literal("question"), v.literal("finished")),
      timeLeftSec: v.number(),
      endsAtMs: v.optional(v.number()),
      quiz: v.object({
        title: v.string(),
        description: v.string(),
        imageUrl: v.optional(v.string()),
        delaySeconds: v.number(),
      }),
      question: v.optional(
        v.object({
          _id: v.id("quizQuestions"),
          title: v.string(),
          description: v.string(),
          imageUrl: v.optional(v.string()),
          allowsMultiple: v.boolean(),
          answerTimeSec: v.number(),
          options: v.array(
            v.object({ _id: v.id("questionOptions"), text: v.string(), imageUrl: v.optional(v.string()) })
          ),
        })
      ),
      myAnswer: v.optional(
        v.object({
          selectedOptionIds: v.array(v.id("questionOptions")),
          isCorrect: v.boolean(),
        })
      ),
      results: v.optional(
        v.object({ myScore: v.number(), totalQuestions: v.number() })
      ),
    })
  ),
  handler: async (ctx, { quizId }) => {
    const userId = await getAuthUserId(ctx);
    const sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_quiz", (q: any) => q.eq("quizId", quizId))
      .order("desc")
      .take(1);
    const session = sessions[0];
    if (!session) return null;
    const quiz = await ctx.db.get(quizId);
    if (!quiz) return null;
    let timeLeftSec = 0;
    let endsAtMs: number | undefined = undefined;
    if (session.status === "waiting") {
      const target = session.startedAt + session.delaySeconds * 1000;
      endsAtMs = target;
      timeLeftSec = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    } else if (session.status === "question") {
      endsAtMs = session.questionEndsAt ?? undefined;
      timeLeftSec = Math.max(0, Math.ceil(((session.questionEndsAt ?? Date.now()) - Date.now()) / 1000));
    }
    let questionData: any | undefined = undefined;
    if (session.status === "question" && session.currentQuestionId) {
      const q = await ctx.db.get(session.currentQuestionId);
      if (q) {
        const opts = await ctx.db
          .query("questionOptions")
          .withIndex("by_question", (qq: any) => qq.eq("questionId", q._id))
          .collect();
        // Convert storage ids to signed URLs
        const imgUrl = q.imageStorageId ? await ctx.storage.getUrl(q.imageStorageId) : q.imageUrl;
        const optWithUrls = await Promise.all(
          opts.map(async (o: any) => ({
            _id: o._id,
            text: o.text,
            imageUrl: o.imageStorageId ? await ctx.storage.getUrl(o.imageStorageId) : o.imageUrl,
          }))
        );
        questionData = {
          _id: q._id,
          title: q.title,
          description: q.description,
          imageUrl: imgUrl ?? q.imageUrl,
          allowsMultiple: q.allowsMultiple,
          answerTimeSec: q.answerTimeSec,
          options: optWithUrls,
        };
      }
    }
    let myAnswer: any | undefined = undefined;
    if (userId && session.status === "question" && session.currentQuestionId) {
      const existing = await ctx.db
        .query("userAnswers")
        .withIndex("by_question_user", (q: any) => q.eq("questionId", session.currentQuestionId!).eq("userId", userId))
        .unique();
      if (existing) myAnswer = { selectedOptionIds: existing.selectedOptionIds, isCorrect: existing.isCorrect };
    }
    let results: { myScore: number; totalQuestions: number } | undefined = undefined;
    if (session.status === "finished") {
      const allQuestions = await ctx.db
        .query("quizQuestions")
        .withIndex("by_quiz", (q: any) => q.eq("quizId", quizId))
        .collect();
      const totalQuestions = allQuestions.length;
      let myScore = 0;
      if (userId) {
        const score = await ctx.db
          .query("sessionScores")
          .withIndex("by_session_user", (q: any) => q.eq("sessionId", session._id).eq("userId", userId))
          .unique();
        myScore = score?.correctCount ?? 0;
      }
      results = { myScore, totalQuestions };
    }
    return {
      sessionId: session._id,
      status: session.status,
      timeLeftSec,
      endsAtMs,
      quiz: {
        title: quiz.title,
        description: quiz.description,
        imageUrl: quiz.imageUrl,
        delaySeconds: quiz.delaySeconds,
      },
      question: questionData,
      myAnswer,
      results,
    };
  },
});

export const getActiveQuizState = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      sessionId: v.id("quizSessions"),
      status: v.union(v.literal("waiting"), v.literal("question"), v.literal("finished")),
      timeLeftSec: v.number(),
      endsAtMs: v.optional(v.number()),
      quiz: v.object({
        title: v.string(),
        description: v.string(),
        imageUrl: v.optional(v.string()),
        delaySeconds: v.number(),
        forcePreview: v.optional(v.boolean()),
        productPlacement: v.optional(
          v.object({
            name: v.optional(v.string()),
            description: v.optional(v.string()),
            logoUrl: v.optional(v.string()),
            imageUrl: v.optional(v.string()),
          })
        ),
      }),
      question: v.optional(
        v.object({
          _id: v.id("quizQuestions"),
          title: v.string(),
          description: v.string(),
          imageUrl: v.optional(v.string()),
          allowsMultiple: v.boolean(),
          answerTimeSec: v.number(),
          options: v.array(
            v.object({ _id: v.id("questionOptions"), text: v.string(), imageUrl: v.optional(v.string()) })
          ),
        })
      ),
      myAnswer: v.optional(
        v.object({
          selectedOptionIds: v.array(v.id("questionOptions")),
          isCorrect: v.boolean(),
        })
      ),
      results: v.optional(v.object({ myScore: v.number(), totalQuestions: v.number() })),
      answers: v.optional(
        v.array(
          v.object({
            question: v.string(),
            answers: v.array(v.string()),
          })
        )
      ),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    // Prefer a running question session
    let sessions = await ctx.db
      .query("quizSessions")
      .withIndex("by_status", (q: any) => q.eq("status", "question"))
      .order("desc")
      .take(1);
    if (sessions.length === 0) {
      sessions = await ctx.db
        .query("quizSessions")
        .withIndex("by_status", (q: any) => q.eq("status", "waiting"))
        .order("desc")
        .take(1);
    }
    if (sessions.length === 0) {
      sessions = await ctx.db
        .query("quizSessions")
        .withIndex("by_status", (q: any) => q.eq("status", "finished"))
        .order("desc")
        .take(1);
    }
    const session = sessions[0];
    if (!session) return null;
    const quiz = await ctx.db.get(session.quizId);
    if (!quiz) return null;
    // Resolve product placement URLs
    let productPlacement: any | undefined = undefined;
    if (quiz.productPlacement) {
      const logoUrl = quiz.productPlacement.logoStorageId
        ? await ctx.storage.getUrl(quiz.productPlacement.logoStorageId)
        : quiz.productPlacement.logoUrl;
      const imageUrl = quiz.productPlacement.imageStorageId
        ? await ctx.storage.getUrl(quiz.productPlacement.imageStorageId)
        : quiz.productPlacement.imageUrl;
      productPlacement = {
        name: quiz.productPlacement.name,
        description: quiz.productPlacement.description,
        logoUrl: logoUrl ?? quiz.productPlacement.logoUrl,
        imageUrl: imageUrl ?? quiz.productPlacement.imageUrl,
      };
    }
    // Force preview override
    if (quiz.forcePreview) {
      return {
        sessionId: session._id,
        status: "waiting" as const,
        timeLeftSec: 0,
        endsAtMs: undefined,
        quiz: {
          title: quiz.title,
          description: quiz.description,
          imageUrl: quiz.imageUrl,
          delaySeconds: quiz.delaySeconds,
          forcePreview: true,
          productPlacement,
        },
        question: undefined,
        myAnswer: undefined,
        results: undefined,
        answers: undefined,
      };
    }
    let timeLeftSec = 0;
    let endsAtMs: number | undefined = undefined;
    if (session.status === "waiting") {
      const target = session.startedAt + session.delaySeconds * 1000;
      endsAtMs = target;
      timeLeftSec = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    } else if (session.status === "question") {
      endsAtMs = session.questionEndsAt ?? undefined;
      timeLeftSec = Math.max(0, Math.ceil(((session.questionEndsAt ?? Date.now()) - Date.now()) / 1000));
    }
    let questionData: any | undefined = undefined;
    if (session.status === "question" && session.currentQuestionId) {
      const q = await ctx.db.get(session.currentQuestionId);
      if (q) {
        const opts = await ctx.db
          .query("questionOptions")
          .withIndex("by_question", (qq: any) => qq.eq("questionId", q._id))
          .collect();
        const imgUrl = q.imageStorageId ? await ctx.storage.getUrl(q.imageStorageId) : q.imageUrl;
        const optWithUrls = await Promise.all(
          opts.map(async (o: any) => ({
            _id: o._id,
            text: o.text,
            imageUrl: o.imageStorageId ? await ctx.storage.getUrl(o.imageStorageId) : o.imageUrl,
          }))
        );
        questionData = {
          _id: q._id,
          title: q.title,
          description: q.description,
          imageUrl: imgUrl ?? q.imageUrl,
          allowsMultiple: q.allowsMultiple,
          answerTimeSec: q.answerTimeSec,
          options: optWithUrls,
        };
      }
    }
    let myAnswer: any | undefined = undefined;
    if (userId && session.status === "question" && session.currentQuestionId) {
      const existing = await ctx.db
        .query("userAnswers")
        .withIndex("by_question_user", (q: any) => q.eq("questionId", session.currentQuestionId!).eq("userId", userId))
        .unique();
      if (existing) myAnswer = { selectedOptionIds: existing.selectedOptionIds, isCorrect: existing.isCorrect };
    }
    let results: { myScore: number; totalQuestions: number } | undefined = undefined;
    let answers: Array<{ question: string; answers: Array<string> }> | undefined = undefined;
    if (session.status === "finished") {
      const allQuestions = await ctx.db
        .query("quizQuestions")
        .withIndex("by_quiz", (q: any) => q.eq("quizId", session.quizId))
        .collect();
      const totalQuestions = allQuestions.length;
      let myScore = 0;
      if (userId) {
        const score = await ctx.db
          .query("sessionScores")
          .withIndex("by_session_user", (q: any) => q.eq("sessionId", session._id).eq("userId", userId))
          .unique();
        myScore = score?.correctCount ?? 0;
      }
      results = { myScore, totalQuestions };
      // collect correct answers for preview display
      answers = [];
      for (const q of allQuestions) {
        const opts = await ctx.db
          .query("questionOptions")
          .withIndex("by_question", (qq: any) => qq.eq("questionId", q._id))
          .collect();
        const texts = opts.filter((o: any) => o.isCorrect).map((o: any) => o.text);
        answers.push({ question: q.title, answers: texts });
      }
    }
    return {
      sessionId: session._id,
      status: session.status,
      timeLeftSec,
      endsAtMs,
      quiz: {
        title: quiz.title,
        description: quiz.description,
        imageUrl: quiz.imageUrl,
        delaySeconds: quiz.delaySeconds,
        productPlacement,
      },
      question: questionData,
      myAnswer,
      results,
      answers,
    };
  },
});

// File upload helpers per Convex docs
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const url = await ctx.storage.generateUploadUrl();
    console.log("[generateUploadUrl] issued");
    return url;
  },
});

export const setQuizImage = mutation({
  args: { quizId: v.id("quizzes"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { quizId, storageId }) => {
    await ensureAdmin(ctx);
    const quiz = await ctx.db.get(quizId);
    console.log("[setQuizImage] before", { quizId, prev: quiz?.imageStorageId, next: storageId });
    if (quiz?.imageStorageId && quiz.imageStorageId !== storageId) {
      await ctx.storage.delete(quiz.imageStorageId);
    }
    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(quizId, { imageStorageId: storageId, imageUrl: url ?? undefined });
    console.log("[setQuizImage] after", { quizId, imageStorageId: storageId, imageUrl: url });
    return null;
  },
});

export const setProductLogo = mutation({
  args: { quizId: v.id("quizzes"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { quizId, storageId }) => {
    await ensureAdmin(ctx);
    const quiz = await ctx.db.get(quizId);
    const prev = quiz?.productPlacement?.logoStorageId;
    console.log("[setProductLogo]", { quizId, prev, next: storageId });
    if (prev && prev !== storageId) {
      await ctx.storage.delete(prev);
    }
    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(quizId, {
      productPlacement: {
        ...(quiz?.productPlacement ?? {}),
        logoStorageId: storageId,
        logoUrl: url ?? undefined,
      },
    });
    console.log("[setProductLogo] patched", { quizId, logoStorageId: storageId, logoUrl: url });
    return null;
  },
});

export const setProductImage = mutation({
  args: { quizId: v.id("quizzes"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { quizId, storageId }) => {
    await ensureAdmin(ctx);
    const quiz = await ctx.db.get(quizId);
    const prev = quiz?.productPlacement?.imageStorageId;
    console.log("[setProductImage]", { quizId, prev, next: storageId });
    if (prev && prev !== storageId) {
      await ctx.storage.delete(prev);
    }
    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(quizId, {
      productPlacement: {
        ...(quiz?.productPlacement ?? {}),
        imageStorageId: storageId,
        imageUrl: url ?? undefined,
      },
    });
    console.log("[setProductImage] patched", { quizId, imageStorageId: storageId, imageUrl: url });
    return null;
  },
});

export const setQuestionImage = mutation({
  args: { questionId: v.id("quizQuestions"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { questionId, storageId }) => {
    await ensureAdmin(ctx);
    const q = await ctx.db.get(questionId);
    console.log("[setQuestionImage] before", { questionId, prev: q?.imageStorageId, next: storageId });
    if (q?.imageStorageId && q.imageStorageId !== storageId) {
      await ctx.storage.delete(q.imageStorageId);
    }
    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(questionId, { imageStorageId: storageId, imageUrl: url ?? undefined });
    console.log("[setQuestionImage] after", { questionId, imageStorageId: storageId, imageUrl: url });
    return null;
  },
});

export const setOptionImage = mutation({
  args: { optionId: v.id("questionOptions"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { optionId, storageId }) => {
    await ensureAdmin(ctx);
    const o = await ctx.db.get(optionId);
    if (o?.imageStorageId && o.imageStorageId !== storageId) {
      await ctx.storage.delete(o.imageStorageId);
    }
    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(optionId, { imageStorageId: storageId, imageUrl: url ?? undefined });
    return null;
  },
});

export const removeQuizImage = mutation({
  args: { quizId: v.id("quizzes") },
  returns: v.null(),
  handler: async (ctx, { quizId }) => {
    await ensureAdmin(ctx);
    const quiz = await ctx.db.get(quizId);
    if (quiz?.imageStorageId) {
      await ctx.storage.delete(quiz.imageStorageId);
    }
    await ctx.db.patch(quizId, { imageStorageId: undefined, imageUrl: undefined });
    console.log("[removeQuizImage]", { quizId });
    return null;
  },
});

export const removeQuestionImage = mutation({
  args: { questionId: v.id("quizQuestions") },
  returns: v.null(),
  handler: async (ctx, { questionId }) => {
    await ensureAdmin(ctx);
    const q = await ctx.db.get(questionId);
    if (q?.imageStorageId) {
      await ctx.storage.delete(q.imageStorageId);
    }
    await ctx.db.patch(questionId, { imageStorageId: undefined, imageUrl: undefined });
    console.log("[removeQuestionImage]", { questionId });
    return null;
  },
});

export const submitAnswer = mutation({
  args: {
    sessionId: v.id("quizSessions"),
    questionId: v.id("quizQuestions"),
    selectedOptionIds: v.array(v.id("questionOptions")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Требуется авторизация");
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "question" || session.currentQuestionId !== args.questionId) {
      throw new Error("Неверное состояние сессии");
    }
    const q = await ctx.db.get(args.questionId);
    if (!q) throw new Error("Вопрос не найден");
    // Validate allowsMultiple
    if (!q.allowsMultiple && args.selectedOptionIds.length > 1) {
      throw new Error("Можно выбрать только один вариант");
    }
    const options = await ctx.db
      .query("questionOptions")
      .withIndex("by_question", (qq: any) => qq.eq("questionId", args.questionId))
      .collect();
    const correctIds = new Set(options.filter((o: any) => o.isCorrect).map((o: any) => o._id));
    const chosen = new Set(args.selectedOptionIds);
    const isCorrect = correctIds.size === chosen.size && [...correctIds].every((id) => chosen.has(id));
    // Upsert answer
    const existing = await ctx.db
      .query("userAnswers")
      .withIndex("by_question_user", (qq: any) => qq.eq("questionId", args.questionId).eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        selectedOptionIds: args.selectedOptionIds,
        isCorrect,
        answeredAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userAnswers", {
        sessionId: args.sessionId,
        questionId: args.questionId,
        userId,
        selectedOptionIds: args.selectedOptionIds,
        isCorrect,
        answeredAt: Date.now(),
      });
    }
    // Update score
    const score = await ctx.db
      .query("sessionScores")
      .withIndex("by_session_user", (q: any) => q.eq("sessionId", args.sessionId).eq("userId", userId))
      .unique();
    if (!score) {
      await ctx.db.insert("sessionScores", {
        sessionId: args.sessionId,
        userId,
        correctCount: isCorrect ? 1 : 0,
      });
    } else {
      const base = score.correctCount ?? 0;
      // Recalculate based on all answers in this session
      const myAnswers = await ctx.db
        .query("userAnswers")
        .withIndex("by_session_user", (q: any) => q.eq("sessionId", args.sessionId).eq("userId", userId))
        .collect();
      const total = myAnswers.reduce((acc: number, a: any) => acc + (a.isCorrect ? 1 : 0), 0);
      await ctx.db.patch(score._id, { correctCount: total });
    }
    return null;
  },
});

export const progressSession = internalAction({
  args: { sessionId: v.id("quizSessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.runQuery(internal.quiz.getSession, { sessionId });
    if (!session) return null;
    if (session.status === "finished") return null;
    if (session.status === "waiting") {
      // Move to first question
      await ctx.runMutation(internal.quiz.advanceToNextQuestion, { sessionId });
      return null;
    }
    if (session.status === "question") {
      // Move to next question or finish
      await ctx.runMutation(internal.quiz.advanceToNextQuestion, { sessionId });
      return null;
    }
    return null;
  },
});

export const getSession = internalQuery({
  args: { sessionId: v.id("quizSessions") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("quizSessions"),
      quizId: v.id("quizzes"),
      status: v.union(v.literal("waiting"), v.literal("question"), v.literal("finished")),
      startedAt: v.number(),
      delaySeconds: v.number(),
      currentQuestionIndex: v.number(),
      currentQuestionId: v.optional(v.id("quizQuestions")),
    })
  ),
  handler: async (ctx, { sessionId }) => {
    const s = await ctx.db.get(sessionId);
    if (!s) return null;
    return {
      _id: s._id,
      quizId: s.quizId,
      status: s.status,
      startedAt: s.startedAt,
      delaySeconds: s.delaySeconds,
      currentQuestionIndex: s.currentQuestionIndex,
      currentQuestionId: s.currentQuestionId,
    };
  },
});

export const advanceToNextQuestion = internalMutation({
  args: { sessionId: v.id("quizSessions") },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const questions = await ctx.db
      .query("quizQuestions")
      .withIndex("by_quiz_order", (q: any) => q.eq("quizId", session.quizId))
      .order("asc")
      .collect();
    const now = Date.now();
    if (session.status === "waiting") {
      if (questions.length === 0) {
        await ctx.db.patch(sessionId, { status: "finished", finishedAt: now });
        return null;
      }
      const first = questions[0];
      const endsAt = now + first.answerTimeSec * 1000;
      await ctx.db.patch(sessionId, {
        status: "question",
        currentQuestionIndex: 0,
        currentQuestionId: first._id,
        questionStartedAt: now,
        questionEndsAt: endsAt,
      });
      await ctx.scheduler.runAt(endsAt, internal.quiz.progressSession, { sessionId });
      return null;
    }
    if (session.status === "question") {
      const nextIndex = (session.currentQuestionIndex ?? -1) + 1;
      if (nextIndex >= questions.length) {
        await ctx.db.patch(sessionId, { status: "finished", finishedAt: now });
        return null;
      }
      const q = questions[nextIndex];
      const endsAt = now + q.answerTimeSec * 1000;
      await ctx.db.patch(sessionId, {
        status: "question",
        currentQuestionIndex: nextIndex,
        currentQuestionId: q._id,
        questionStartedAt: now,
        questionEndsAt: endsAt,
      });
      await ctx.scheduler.runAt(endsAt, internal.quiz.progressSession, { sessionId });
      return null;
    }
    return null;
  },
});

export const getLeaderboard = query({
  args: { sessionId: v.id("quizSessions"), limit: v.number() },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      fullName: v.optional(v.string()),
      email: v.optional(v.string()),
      correctCount: v.number(),
      place: v.number(),
    })
  ),
  handler: async (ctx, { sessionId, limit }) => {
    const scores = await ctx.db
      .query("sessionScores")
      .withIndex("by_session", (q: any) => q.eq("sessionId", sessionId))
      .order("desc")
      .collect();
    // Sort by correctCount desc, then by _creationTime asc for stability
    scores.sort((a: any, b: any) => b.correctCount - a.correctCount || a._creationTime - b._creationTime);
    const sliced = scores.slice(0, limit);
    const result = [] as Array<any>;
    for (let i = 0; i < sliced.length; i++) {
      const s = sliced[i];
      const user = await ctx.db.get(s.userId);
      result.push({
        userId: s.userId,
        fullName: user?.fullName,
        email: user?.email,
        correctCount: s.correctCount,
        place: i + 1,
      });
    }
    return result;
  },
});


