"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Progress } from "@/components/ui/progress";
import { ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ActiveQuizPage() {
  const state = useQuery(api.quiz.getActiveQuizState);
  const submit = useMutation(api.quiz.submitAnswer);
  const router = useRouter();
  const [localTick, setLocalTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLocalTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

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

  if (state === undefined) return <div className="p-6">Загрузка...</div>;
  if (state === null||state?.quiz?.forcePreview)
    return (
      <div className="max-w-3xl h-screen flex items-center justify-center mx-auto p-6">
        <div className="absolute left-6 top-6">
        <ArrowLeftIcon
          className="w-6 h-6 text-[#18bbac]"
          onClick={() => router.back()}
        />
      </div>
        <div className="rounded-xl border p-6 bg-white text-center space-y-4">
          <div className="w-full h-40 overflow-hidden flex items-end justify-center">
            <img src="/wait.png" alt="Ожидание" className="max-h-full max-w-full object-contain" />
          </div>
          <h2 className="text-2xl text-[#18bbac] font-bold">Квиз вот-вот начнётся, будьте готовы!</h2>
          <p className="text-slate-600 text-sm">Дождитесь старта квиза модератором.</p>
        </div>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">

      <header>
        <h1 className="text-xl md:text-2xl font-bold">{state.quiz.title}</h1>
        <p className="text-slate-600 text-sm md:text-base">{state.quiz.description}</p>
      </header>
      {state.status === "waiting" && (
        <div className="rounded-xl border p-6 text-center bg-white">
          <p className="text-lg">Скоро начнем! <br /> Осталось секунд: <span className="font-bold text-[#18bbac]">{progressData.left}</span></p>
        </div>
      )}
      {state.status === "question" && state.question && (
        <div className="space-y-5 rounded-xl border p-6 bg-white">
          {state.question.imageUrl && (
            <div className="w-full overflow-hidden rounded-xl">
              <img src={state.question.imageUrl} alt="" className="w-full h-64 object-contain" />
            </div>
          )}
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{state.question.title}</h2>
            <p className="text-slate-600 text-sm">{state.question.description}</p>
          </div>
          <div className="space-y-2">
            <Progress value={100 - progressData.value} indicatorColor={progressData.color} />
            <div className="text-xs text-slate-600">Осталось: <span className="font-medium" style={{ color: progressData.color }}>{progressData.left}s</span></div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {state.question.options.map((o: any) => {
              const checked = state.myAnswer?.selectedOptionIds?.includes(o._id) ?? false;
              return (
                <button
                  key={o._id}
                  disabled={!!state.myAnswer}
                  onClick={() =>
                    submit({
                      sessionId: state.sessionId as Id<"quizSessions">,
                      questionId: state.question!._id as Id<"quizQuestions">,
                      selectedOptionIds: [o._id as Id<"questionOptions">],
                    })
                  }
                  className={`${checked ? "border-[#18bbac] bg-[#18bbac]/10" : ""} border rounded-md p-3 text-left hover:shadow`}
                >
                  {o.imageUrl && (
                    <img src={o.imageUrl} alt="" className="w-full h-32 object-contain rounded mb-2" />
                  )}
                  <div className="font-medium">{o.text}</div>
                </button>
              );
            })}
          </div>
          {state.myAnswer && (
            <div className={`rounded-md p-3 text-sm bg-emerald-50 text-[#18bbac]`}>
              Ответ сохранен
            </div>
          )}
        </div>
      )}
      {state.status === "finished" && (
        <FinishedBlock sessionId={state.sessionId as Id<"quizSessions">} myScore={state.results?.myScore ?? 0} />
      )}
    </div>
  );
}

function FinishedBlock({ sessionId, myScore }: { sessionId: Id<"quizSessions">; myScore: number }) {
  const me = useQuery(api.quiz.currentUser);
  const top = useQuery(api.quiz.getLeaderboard, sessionId ? { sessionId, limit: 1000 } : "skip");
  const place = useMemo(() => {
    if (!me || !top) return undefined;
    const idx = top.findIndex((r) => (r.userId as any) === (me._id as any));
    return idx >= 0 ? idx + 1 : undefined;
  }, [me, top]);
  return (
    <div className="rounded-xl border p-6 bg-white space-y-2">
      <p className="text-lg font-semibold">Квиз завершен</p>
      {place !== undefined ? (
        <p className="text-sm text-slate-700">
          Вы набрали <span className="font-semibold text-[#18bbac]">{myScore}</span> баллов и заняли <span className="font-semibold">{place}</span> место!<br />
          Поздравляем! Спасибо вам за проявленный интерес к нашим квизам
        </p>
      ) : (
        <p className="text-sm text-slate-700">
          Вы набрали <span className="font-semibold text-[#18bbac]">{myScore}</span> баллов!<br />
          Поздравляем! Спасибо вам за проявленный интерес к нашим квизам
        </p>
      )}
    </div>
  );
}


