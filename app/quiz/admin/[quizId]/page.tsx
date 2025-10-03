"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";


export default function QuizAdminEditPage() {
  const { quizId } = useParams();
  const quiz = useQuery(api.quiz.getQuiz, quizId ? { quizId: quizId as Id<"quizzes"> } : "skip");
  const updateQuiz = useMutation(api.quiz.updateQuiz);
  const addQuestion = useMutation(api.quiz.addQuestion);
  const updateQuestion = useMutation(api.quiz.updateQuestion);
  const deleteQuestion = useMutation(api.quiz.deleteQuestion);
  const addOption = useMutation(api.quiz.addOption);
  const updateOption = useMutation(api.quiz.updateOption);
  const deleteOption = useMutation(api.quiz.deleteOption);
  const state = useQuery(api.quiz.getPublicSessionState, quizId ? { quizId: quizId as Id<"quizzes"> } : "skip");
  const [saving, setSaving] = useState(false);
  const generateUploadUrl = useMutation(api.quiz.generateUploadUrl);
  const setQuizImage = useMutation(api.quiz.setQuizImage);
  const setQuestionImage = useMutation(api.quiz.setQuestionImage);
  const setOptionImage = useMutation(api.quiz.setOptionImage);
  const removeQuizImage = useMutation(api.quiz.removeQuizImage);
  const removeQuestionImage = useMutation(api.quiz.removeQuestionImage);
  const setProductLogo = useMutation(api.quiz.setProductLogo);
  const setProductImage = useMutation(api.quiz.setProductImage);
  const resetQuizSessions = useMutation(api.quiz.resetQuizSessions);
  const updateQuizForce = useMutation(api.quiz.updateQuiz);
  const me = useQuery(api.quiz.currentUser);

  if (quiz === undefined || me === undefined) return <div className="p-6">Загрузка...</div>;
  if (!me || me.email !== "admin@mail.com") {
    return <div className="p-6">Доступ запрещен</div>;
  }
  if (quiz === null) return <div className="p-6">Квиз не найден</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Редактирование квиза</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            defaultValue={quiz.title}
            onBlur={async (e) => {
              setSaving(true);
              try {
                await updateQuiz({ quizId: quiz._id, title: e.target.value, description: quiz.description, imageUrl: quiz.imageUrl, delaySeconds: quiz.delaySeconds });
              } finally { setSaving(false); }
            }}
            className="border rounded-md p-2"
          />
          <input
            defaultValue={quiz.description}
            onBlur={async (e) => {
              setSaving(true);
              try {
                await updateQuiz({ quizId: quiz._id, title: quiz.title, description: e.target.value, imageUrl: quiz.imageUrl, delaySeconds: quiz.delaySeconds });
              } finally { setSaving(false); }
            }}
            className="border rounded-md p-2"
          />
          <div className="flex items-center gap-2">
            <input
              defaultValue={quiz.delaySeconds}
              type="number"
              min={0}
              onBlur={async (e) => {
                setSaving(true);
                try {
                  await updateQuiz({ quizId: quiz._id, title: quiz.title, description: quiz.description, imageUrl: quiz.imageUrl, delaySeconds: Number(e.target.value || 0) });
                } finally { setSaving(false); }
              }}
              className="border rounded-md p-2 w-full"
            />
            <span className="text-sm text-slate-600 whitespace-nowrap">delay, c</span>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Картинка квиза</label>
          <div className="flex items-center gap-3 mt-2">
            {quiz.imageUrl && <img src={quiz.imageUrl} alt="" className="w-32 h-20 object-cover rounded" />}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const postUrl = await generateUploadUrl();
                const res = await fetch(postUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
                const json = await res.json();
                await setQuizImage({ quizId: quiz._id, storageId: json.storageId });
              }}
            />
            {(quiz.imageUrl) && (
              <button
                onClick={() => removeQuizImage({ quizId: quiz._id })}
                className="text-sm text-rose-600 underline"
              >Удалить</button>
            )}
          </div>
        </div>
        <div className="text-sm text-slate-600">{saving ? "Сохранение..." : ""}</div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Вопросы</h2>
          <button
            onClick={() => addQuestion({ quizId: quiz._id, title: "Новый вопрос", description: "", imageUrl: undefined, answerTimeSec: 15, allowsMultiple: false, order: (quiz.questions.at(-1)?.order ?? -1) + 1 })}
            className="px-3 py-1 rounded-md text-white"
            style={{ backgroundColor: "#18bbac" }}
          >Добавить вопрос</button>
        </div>
        <div className="space-y-4">
          {quiz.questions.map((q) => (
            <div key={q._id} className="rounded-xl border p-4 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">ID: {q._id}</div>
                <button
                  onClick={async () => {
                    if (confirm("Удалить вопрос со всеми вариантами?")) {
                      await deleteQuestion({ questionId: q._id });
                    }
                  }}
                  className="text-sm text-rose-600 underline"
                >Удалить вопрос</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input defaultValue={q.title} onBlur={(e) => updateQuestion({ questionId: q._id, title: e.target.value, description: q.description, imageUrl: q.imageUrl, answerTimeSec: q.answerTimeSec, allowsMultiple: q.allowsMultiple, order: q.order })} className="border rounded-md p-2" />
                <input defaultValue={q.description} onBlur={(e) => updateQuestion({ questionId: q._id, title: q.title, description: e.target.value, imageUrl: q.imageUrl, answerTimeSec: q.answerTimeSec, allowsMultiple: q.allowsMultiple, order: q.order })} className="border rounded-md p-2" />
                <input defaultValue={q.answerTimeSec} type="number" onBlur={(e) => updateQuestion({ questionId: q._id, title: q.title, description: q.description, imageUrl: q.imageUrl, answerTimeSec: Number(e.target.value), allowsMultiple: q.allowsMultiple, order: q.order })} className="border rounded-md p-2" />
              </div>
              <div className="flex items-center gap-3 mt-2">
                {q.imageUrl && <img src={q.imageUrl} alt="" className="w-32 h-20 object-cover rounded" />}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const postUrl = await generateUploadUrl();
                    const res = await fetch(postUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
                    const json = await res.json();
                    await setQuestionImage({ questionId: q._id, storageId: json.storageId });
                  }}
                />
                {q.imageUrl && (
                  <button
                    onClick={() => removeQuestionImage({ questionId: q._id })}
                    className="text-sm text-rose-600 underline"
                  >Удалить</button>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Варианты</div>
                  <button onClick={() => addOption({ questionId: q._id, text: "Вариант", imageUrl: undefined, isCorrect: false })} className="text-sm underline text-[#18bbac]">Добавить вариант</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {q.options.map((o: any) => (
                    <div key={o._id} className="border rounded-md p-3">
                      <input defaultValue={o.text} onBlur={(e) => updateOption({ optionId: o._id, text: e.target.value, imageUrl: o.imageUrl, isCorrect: o.isCorrect })} className="border rounded-md p-2 w-full mb-2" />
                      {/* убрали загрузку картинки у вариантов */}
                      <label className="text-sm flex items-center gap-2">
                        <input type="checkbox" defaultChecked={o.isCorrect} onChange={(e) => updateOption({ optionId: o._id, text: o.text, imageUrl: o.imageUrl, isCorrect: e.target.checked })} />
                        Правильный
                      </label>
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => deleteOption({ optionId: o._id })}
                          className="text-sm text-rose-600 underline"
                        >Удалить</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Product placement</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Название</label>
            <input
              defaultValue={quiz.productPlacement?.name ?? ""}
              placeholder="Например: Компания X"
              onBlur={(e) => updateQuiz({
                quizId: quiz._id,
                title: quiz.title,
                description: quiz.description,
                imageUrl: quiz.imageUrl,
                delaySeconds: quiz.delaySeconds,
                productPlacement: {
                  name: e.target.value,
                  description: quiz.productPlacement?.description,
                  logoUrl: quiz.productPlacement?.logoUrl,
                  logoStorageId: quiz.productPlacement?.logoStorageId,
                  // imageStorageId handled via upload button
                }
              })}
              className="border rounded-md p-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Описание</label>
            <input
              defaultValue={quiz.productPlacement?.description ?? ""}
              placeholder="Короткое описание продукта/бренда"
              onBlur={(e) => updateQuiz({
                quizId: quiz._id,
                title: quiz.title,
                description: quiz.description,
                imageUrl: quiz.imageUrl,
                delaySeconds: quiz.delaySeconds,
                productPlacement: {
                  name: quiz.productPlacement?.name,
                  description: e.target.value,
                  logoUrl: quiz.productPlacement?.logoUrl,
                  logoStorageId: quiz.productPlacement?.logoStorageId,
                  // imageStorageId handled via upload button
                }
              })}
              className="border rounded-md p-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Логотип</label>
            <div className="flex items-center gap-2">
              {quiz.productPlacement?.logoUrl && (
                <img src={quiz.productPlacement.logoUrl} alt="Логотип" className="w-20 h-14 object-contain rounded border" />
              )}
              <input type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const postUrl = await generateUploadUrl();
                const res = await fetch(postUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
                const json = await res.json();
                await setProductLogo({ quizId: quiz._id, storageId: json.storageId });
              }} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Изображение</label>
            <div className="flex items-center gap-2">
              {quiz.productPlacement?.imageUrl && (
                <img src={quiz.productPlacement.imageUrl} alt="Изображение" className="w-24 h-16 object-contain rounded border" />
              )}
              <input type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const postUrl = await generateUploadUrl();
                const res = await fetch(postUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
                const json = await res.json();
                await setProductImage({ quizId: quiz._id, storageId: json.storageId });
              }} />
            </div>
          </div>
        </div>
      </section>

      {state && (
        <section>
          <h2 className="text-xl font-semibold mb-2">Состояние</h2>
          <div className="rounded-xl border p-4 bg-white text-sm md:text-base">
            <div className="text-sm">Статус: <span className="font-medium">{state.status}</span></div>
            <div className="text-sm">Осталось: <span className="font-medium">{state.timeLeftSec}s</span></div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => resetQuizSessions({ quizId: quiz._id })}
              className="px-3 py-1 rounded-md text-white bg-black"
              title="Сбросить все прохождения и очистить результаты"
            >
              Сбросить результаты
            </button>
            <button
              onClick={() => updateQuizForce({
                quizId: quiz._id,
                title: quiz.title,
                description: quiz.description,
                imageUrl: quiz.imageUrl,
                delaySeconds: quiz.delaySeconds,
                imageStorageId: quiz.imageStorageId,
                productPlacement: quiz.productPlacement,
                forcePreview: true,
              })}
              className="px-3 py-1 rounded-md text-white"
              style={{ backgroundColor: "#18bbac" }}
              title="Показать экран с QR (force preview)"
            >
              Показать QR
            </button>
            <button
              onClick={() => updateQuizForce({
                quizId: quiz._id,
                title: quiz.title,
                description: quiz.description,
                imageUrl: quiz.imageUrl,
                delaySeconds: quiz.delaySeconds,
                imageStorageId: quiz.imageStorageId,
                productPlacement: quiz.productPlacement,
                forcePreview: false,
              })}
              className="px-3 py-1 rounded-md text-white bg-slate-600"
              title="Вернуть обычный режим"
            >
              Вернуть режим
            </button>
          </div>
          
        </section>
      )}
    </div>
  );
}


