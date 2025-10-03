"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export default function QuizAdminListPage() {
  const me = useQuery(api.quiz.currentUser);
  const quizzes = useQuery(api.quiz.listQuizzes) ?? [];
  const createQuiz = useMutation(api.quiz.createQuiz);
  const startQuiz = useMutation(api.quiz.startQuiz);
  const [busy, setBusy] = useState(false);

  if (me === undefined) return <div className="p-6">Загрузка...</div>;
  if (!me || me.email !== "admin@mail.com") {
    return (
      <div className="max-w-xl mx-auto p-6">
        <p className="text-sm text-slate-600">Доступ запрещен</p>
        <Link href="/quiz" className="underline text-[#18bbac]">Вернуться</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Квизы</h1>
        <Link href="/quiz" className="text-[#18bbac] underline">К пользователю</Link>
      </header>
      <div className="rounded-xl border p-4 bg-white">
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await createQuiz({ title: "Новый квиз", description: "Описание", delaySeconds: 5, imageUrl: undefined });
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="px-4 py-2 rounded-md text-white"
          style={{ backgroundColor: "#18bbac" }}
        >
          Создать квиз
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {quizzes.map((q) => (
          <div key={q._id} className="rounded-xl border p-4 bg-white flex items-center justify-between">
            <div>
              <div className="font-semibold">{q.title}</div>
              <div className="text-sm text-slate-600">delay: {q.delaySeconds}s</div>
            </div>
            <div className="flex items-center gap-3">
              {q.imageUrl && <img src={q.imageUrl} alt="" className="w-20 h-14 object-cover rounded" />}
              <Link href={`/quiz/admin/${q._id}`} className="underline text-[#18bbac]">Редактировать</Link>
              <button
                onClick={() => startQuiz({ quizId: q._id })}
                className="px-3 py-1 rounded-md text-white"
                style={{ backgroundColor: "#18bbac" }}
              >Начать</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


