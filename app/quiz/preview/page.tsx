"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import SarahVideo from "@/components/SarahVideo";
import { useEffect, useMemo, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";

export default function PreviewPage() {
  const state = useQuery(api.quiz.getActiveQuizState);
  const submit = useMutation(api.quiz.submitAnswer);
  const [videoState, setVideoState] = useState<"idle" | "stay" | "hello" | "think" | "write">("idle");
  useEffect(() => {
    setVideoState("stay");
  }, []);
  const [localTick, setLocalTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLocalTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // таймеры ожидания/вопроса
  const baselineRef = useRef<{ left: number; total: number; tickAt: number; endsAt?: number } | null>(null);
  const lastQuestionId = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const currentQuestionId = state.question?._id ?? null;
    const statusKey = state.status;
    const changed = lastQuestionId.current !== currentQuestionId || baselineRef.current === null || baselineRef.current?.left === undefined;
    if (changed) {
      const total = statusKey === "question" ? state.question?.answerTimeSec ?? 0 : state.quiz.delaySeconds;
      const endsAt = (state as any).endsAtMs as number | undefined;
      if (endsAt) {
        const leftFromEnds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        baselineRef.current = { left: leftFromEnds, total, tickAt: localTick, endsAt };
      } else {
        baselineRef.current = { left: state.timeLeftSec ?? 0, total, tickAt: localTick };
      }
      lastQuestionId.current = currentQuestionId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.timeLeftSec, state?.question?._id, state?.question?.answerTimeSec, state?.quiz?.delaySeconds]);

  const progressData = useMemo(() => {
    if (!state) return { value: 0, color: "#18bbac", left: 0, fraction: 1 };
    const baseline = baselineRef.current;
    const endsAt = (state as any).endsAtMs ?? baseline?.endsAt;
    const elapsed = baseline ? Math.max(0, localTick - baseline.tickAt) : 0;
    const total = baseline?.total ?? 0;
    const leftStrict = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : undefined;
    const baseLeft = leftStrict ?? baseline?.left ?? (state.timeLeftSec ?? 0);
    const left = baseline && !leftStrict ? Math.max(0, baseLeft - elapsed) : baseLeft;
    const ratio = total > 0 ? left / total : 1;
    let color = "#18bbac";
    if (ratio <= 0.2) color = "#fb6108";
    const fraction = ratio;
    const value = Math.round((1 - fraction) * 100);
    return { value, color, left, fraction };
  }, [state, localTick]);

  // Scale typography based on content length (title + description)
  const titleClass = useMemo(() => {
    const len = (state?.question?.title?.length ?? 0) + (state?.question?.description?.length ?? 0);
    if (len <= 80) return "text-xl md:text-3xl";
    if (len <= 160) return "text-lg md:text-2xl";
    if (len <= 280) return "text-base md:text-xl";
    return "text-sm md:text-lg";
  }, [state?.question?.title, state?.question?.description]);

  const descClass = useMemo(() => {
    const len = (state?.question?.title?.length ?? 0) + (state?.question?.description?.length ?? 0);
    if (len <= 200) return "text-base md:text-lg";
    if (len <= 400) return "text-sm md:text-base";
    if (len <= 800) return "text-xs md:text-sm";
    return "text-[10px] md:text-xs";
  }, [state?.question?.title, state?.question?.description]);

  // Helpers for scaling correct answers list
  function getAnswerQuestionClass(len: number): string {
    if (len <= 60) return "text-sm md:text-base";
    if (len <= 120) return "text-xs md:text-sm";
    if (len <= 220) return "text-[11px] md:text-xs";
    return "text-[10px] md:text-[11px]";
  }
  function getAnswerTextClass(len: number): string {
    if (len <= 100) return "text-sm md:text-base";
    if (len <= 200) return "text-xs md:text-sm";
    if (len <= 400) return "text-[11px] md:text-xs";
    return "text-[10px] md:text-[11px]";
  }

  return (
    <div className="min-h-screen flex items-center justify-center ">
      <div className="relative w-[768px] h-[1152px] rounded-2xl border shadow overflow-hidden bg-white">
        {/* Sarah bottom-left */}
        <SarahVideo
          state={videoState}
          resetVideoState={() => setVideoState("idle")}
          onCycle={(ended) => {
            // Вставляем 3с idle между stay и write
            if (ended === "write") {
              setVideoState("idle");
              setTimeout(() => setVideoState("stay"), 3000);
            }
            if (ended === "stay") {
              setVideoState("idle");
              setTimeout(() => setVideoState("write"), 3000);
            }
          }}
          className="absolute left-0 bottom-0 h-[360px]"
        />

        {/* Content pinned to top to keep Sarah visible */}
        <div className="absolute inset-0 flex flex-col items-center justify-start pt-12 p-8 text-center gap-4">
          {state === undefined && <div className="text-slate-600">Загрузка...</div>}

          {(state === null || state?.quiz?.forcePreview) && (
            <>
            <h1 className="max-w-md text-4xl text-center text-[#18bbac] font-bold">Увлекательные квизы от Доктора Сары!</h1>
              <h2 className="text-2xl text-[#18bbac] font-bold">Скоро начнём!</h2>
              <p className="text-slate-600 max-w-md text-sm">
                Здесь скоро появится квиз, как только он начнётся. <br/> Оставайтесь на связи.
              </p>
              <p className="text-slate-600 max-w-md text-sm">Для участия необходимо пройти регистрацию</p>
              <img src="/7.png" alt="QR" className="w-80 aspect-square" />
              {/* <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 w-full max-w-md">
                <button className="px-3 py-2 rounded-md text-sm bg-slate-200 text-slate-700" onClick={() => setVideoState("idle")}>idle</button>
                <button className="px-3 py-2 rounded-md text-sm text-white" style={{ backgroundColor: "#18bbac" }} onClick={() => setVideoState("stay")}>stay</button>
                <button className="px-3 py-2 rounded-md text-sm text-white" style={{ backgroundColor: "#18bbac" }} onClick={() => setVideoState("hello")}>hello</button>
                <button className="px-3 py-2 rounded-md text-sm text-white" style={{ backgroundColor: "#18bbac" }} onClick={() => setVideoState("think")}>think</button>
                <button className="px-3 py-2 rounded-md text-sm text-white" style={{ backgroundColor: "#18bbac" }} onClick={() => setVideoState("write")}>write</button>
              </div> */}
            </>
          )}

          {state && !state.quiz?.forcePreview && (
            <div className="w-full max-w-3xl space-y-4">
              {state.status === "waiting" && (
                <div className="rounded-xl border p-4 md:p-6 bg-white">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-full h-36 md:h-48 overflow-hidden flex items-end justify-center">
                      <img src="/wait.png" alt="Ожидание старта" className="max-h-full max-w-full object-contain" />
                    </div>
                    <p className="text-base md:text-lg text-center">
                      Скоро начнем! Осталось секунд: <span className="font-bold text-[#18bbac]">{progressData.left}</span>
                    </p>
                  </div>
                </div>
              )}
              {state.status === "question" && state.question && (
                <div className="space-y-4 md:space-y-5 rounded-xl border p-4 md:p-6 bg-white">
                  {state.question.imageUrl && (
                    <div className="w-full h-40 md:h-80 overflow-hidden rounded-xl bg-white flex items-center justify-center">
                      <img src={state.question.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <h2 className={`${titleClass} font-semibold`}>{state.question.title}</h2>
                    <p className={`text-slate-600 ${descClass}`}>{state.question.description}</p>
                  </div>
                  <div className="space-y-2">
                    <Progress className="rotate-180 h-1.5 md:h-2" fraction={progressData.fraction} reverse indicatorColor={progressData.color} />
                    <div className="text-xs md:text-sm text-slate-600">Осталось: <span className="font-medium" style={{ color: progressData.color }}>{progressData.left} c.</span></div>
                  </div>
                  {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    {state.question.options.map((o: any) => (
                      <button
                        key={o._id}
                        disabled
                        className={`border rounded-xl p-3 md:p-4 text-left shadow-sm transition ${"border-slate-200"}`}
                      >
                        {o.imageUrl && (
                          <div className="w-full h-24 md:h-28 mb-2 md:mb-3 flex items-center justify-center">
                            <img src={o.imageUrl} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
                          </div>
                        )}
                        <div className="font-medium text-sm md:text-base">{o.text}</div>
                      </button>
                    ))}
                  </div> */}
                </div>
              )}
              {state.status === "finished" && (
                <>
                  <TopTen sessionId={state.sessionId as any} />
                  <CorrectAnswers />
                </>
              )}
            </div>
          )}
        </div>
        {/* Product placement bottom-right, opposite Sarah */}
        {state && state.quiz?.productPlacement && (
          <div className="absolute right-3 bottom-3 md:right-5 md:bottom-5">
            <div className="rounded-xl border bg-white/90 backdrop-blur p-3 md:p-4 w-80 md:w-80 shadow">
              <div className="flex items-start gap-6">
                {state.quiz.productPlacement.logoUrl && (
                  <img src={state.quiz.productPlacement.logoUrl} alt="Логотип" className="w-12 h-12 object-contain" />
                )}
                <div className="min-w-0">
                  <div className="text-sm md:text-base font-semibold truncate">{state.quiz.productPlacement.name || ""}</div>
                  <div className="text-xs md:text-sm text-slate-600 line-clamp-2">{state.quiz.productPlacement.description || ""}</div>
                </div>
              </div>
              {state.quiz.productPlacement.imageUrl && (
                <div className="mt-3 w-full h-24 md:h-28 rounded-lg overflow-hidden bg-white flex items-center justify-center">
                  <img src={state.quiz.productPlacement.imageUrl} alt="Изображение" className="max-h-full max-w-full object-contain" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import type { Id } from "@/convex/_generated/dataModel";

function TopTen({ sessionId }: { sessionId: string }) {
  const rows = useQuery(api.quiz.getLeaderboard, sessionId ? { sessionId: sessionId as Id<"quizSessions">, limit: 10 } : "skip") ?? [];
  return (
    <div className="rounded-xl border p-4 md:p-6 bg-white">
      <p className="text-base md:text-xl text-[#18bbac] font-semibold mb-6">Квиз завершен! А вот и лучшие знатоки:</p>
      <div className="space-y-2 text-left">
        {rows.map((r) => (
          <div key={String(r.userId)} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 text-center font-semibold">{r.place}</span>
              <div>
                <div className="font-medium text-sm md:text-base">{r.fullName || "—"}</div>
                <div className="text-xs text-slate-500 hidden sm:block">{r.email || "—"}</div>
              </div>
            </div>
            <div className="font-semibold">{r.correctCount}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-sm text-slate-500">Нет данных</div>}
      </div>
    </div>
  );
}

function getAnswerQuestionClass(len: number): string {
  if (len <= 60) return "text-sm md:text-base";
  if (len <= 120) return "text-xs md:text-sm";
  if (len <= 220) return "text-[11px] md:text-xs";
  return "text-[10px] md:text-[11px]";
}
function getAnswerTextClass(len: number): string {
  if (len <= 100) return "text-sm md:text-base";
  if (len <= 200) return "text-xs md:text-sm";
  if (len <= 400) return "text-[11px] md:text-xs";
  return "text-[10px] md:text-[11px]";
}

function CorrectAnswers() {
  const state = useQuery(api.quiz.getActiveQuizState);
  const items = state?.answers ?? [];
  if (!state || state.status !== "finished") return null;
  return (
    <div className="rounded-xl border p-4 md:p-6 bg-white">
      <p className="text-base md:text-lg font-semibold mb-2">Правильные ответы</p>
      <div className="grid grid-cols-1 gap-2">
        {items.map((it, idx) => {
          const qLen = (it.question?.length ?? 0);
          const aLen = (it.answers?.join(", ")?.length ?? 0);
          return (
            <div key={idx} className="rounded-md border p-3 text-left">
              <div className={`${getAnswerQuestionClass(qLen)} font-semibold mb-1`}>{it.question}</div>
              <div className={`${getAnswerTextClass(aLen)} text-[#18bbac]`}>{it.answers.join(", ") || "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


