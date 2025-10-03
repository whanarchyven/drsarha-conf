"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useMemo, useRef, useState } from "react";

export default function ChatAdminPage() {
  const items = useQuery(api.chat.listAwaiting, {});
  const phrases = useQuery(api.chat.listPhrases, {});
  const settings = useQuery(api.chat.getSettings, {});
  const modUpdate = useMutation(api.chat.modUpdate);
  const modDelete = useMutation(api.chat.modDelete);
  const modApprove = useMutation(api.chat.modApprove);
  const upsertPhrase = useMutation(api.chat.upsertPhrase);
  const deletePhrase = useMutation(api.chat.deletePhrase);
  const setSettings = useMutation(api.chat.setSettings);
  const showNow = useMutation(api.chat.showNow);

  // Sound notification on new incoming tickets
  const loadedRef = useRef(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!items) return;
    const currentIds = new Set(items.map((t: any) => String(t._id)));
    if (!loadedRef.current) {
      loadedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }
    // if there is any id in current not present before => new ticket(s)
    let hasNew = false;
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) {
        hasNew = true;
        break;
      }
    }
    if (hasNew) {
      // play short beep using Web Audio API
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.45);
      } catch (e) {
        // ignore if autoplay blocked
      }
    }
    prevIdsRef.current = currentIds;
  }, [items]);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Модерация чата</h1>
      <p className="text-sm text-gray-600">Очередь ожидания модерации</p>
      <div className="space-y-4">
        {items?.length ? (
          items.map((t) => (
            <TicketRow
              key={t._id}
              ticket={t}
              onSave={async (q, a) => {
                await modUpdate({ ticketId: t._id, modQuestion: q, modAnswer: a });
              }}
              onApprove={async () => {
                await modApprove({ ticketId: t._id });
              }}
              onDelete={async () => {
                await modDelete({ ticketId: t._id });
              }}
            />
          ))
        ) : (
          <div className="text-gray-500">Пока нет заявок</div>
        )}
      </div>

      <hr className="my-6" />
      <h2 className="text-xl font-semibold">Фразы Сары (превью-облако)</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <div className="text-sm text-gray-600 mb-2">Интервал появления (мс)</div>
          <div className="flex gap-2">
            <input
              className="border rounded p-2 w-full"
              type="number"
              defaultValue={settings?.intervalMs ?? 5000}
              min={1000}
              step={500}
              onBlur={async (e) => {
                const v = Number(e.target.value || 5000);
                await setSettings({ intervalMs: Math.max(500, v), randomize: settings?.randomize ?? false });
              }}
            />
            <button className="px-3 py-2 rounded bg-slate-800 text-white" onClick={() => setSettings({ intervalMs: settings?.intervalMs ?? 5000, randomize: settings?.randomize ?? false })}>Сохранить</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" defaultChecked={!!settings?.randomize} onChange={(e) => setSettings({ intervalMs: settings?.intervalMs ?? 5000, randomize: e.target.checked })} />
          <span className="text-sm">Случайная фраза</span>
        </div>
        <div className="flex justify-end">
          <button
            className="px-3 py-2 rounded text-white"
            style={{ backgroundColor: "#18bbac" }}
            onClick={async () => {
              await upsertPhrase({ text: "Новая фраза", visible: false, durationMs: 2000, order: (phrases?.at(-1)?.order ?? 0) + 1 });
            }}
          >Добавить фразу</button>
        </div>
      </div>
      <div className="space-y-3">
        {phrases?.map((p) => (
          <div key={String(p._id)} className="border rounded p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
            <input defaultValue={p.text} className="md:col-span-11 border rounded p-2"
              onBlur={(e) => upsertPhrase({ phraseId: p._id as any, text: e.target.value, visible: p.visible, durationMs: p.durationMs, order: p.order })}
            />
            <div className="md:col-span-2 flex items-center gap-2">
              <label className="text-sm">Показывать</label>
              <input type="checkbox" defaultChecked={p.visible} onChange={(e) => upsertPhrase({ phraseId: p._id as any, text: p.text, visible: e.target.checked, durationMs: p.durationMs, order: p.order })} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-gray-600">Длительность (мс)</div>
              <input type="number" className="border rounded p-2 w-full" defaultValue={p.durationMs} min={500} step={100}
                onBlur={(e) => upsertPhrase({ phraseId: p._id as any, text: p.text, visible: p.visible, durationMs: Number(e.target.value || 2000), order: p.order })}
              />
            </div>
            <div className="md:col-span-1">
              <div className="text-sm text-gray-600">Порядок</div>
              <input type="number" className="border rounded p-2 w-full" defaultValue={p.order} min={0}
                onBlur={(e) => upsertPhrase({ phraseId: p._id as any, text: p.text, visible: p.visible, durationMs: p.durationMs, order: Number(e.target.value || 0) })}
              />
            </div>
            <div className="md:col-span-4 flex gap-2 justify-end">
              <button className="px-3 py-2 rounded border" onClick={() => showNow({ text: p.text, durationMs: p.durationMs })}>Показать сейчас</button>
              <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={() => deletePhrase({ phraseId: p._id as any })}>Удалить</button>
            </div>
          </div>
        ))}
        {(!phrases || phrases.length === 0) && <div className="text-sm text-gray-500">Пока нет фраз</div>}
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  onSave,
  onApprove,
  onDelete,
}: {
  ticket: any;
  onSave: (q: string, a: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [q, setQ] = useState(ticket.modQuestion ?? ticket.userQuestion);
  const [a, setA] = useState(ticket.modAnswer ?? ticket.modelAnswer ?? "");
  const [loading, setLoading] = useState(false);

  return (
    <div className="border rounded p-4 space-y-3">
      <div>
        <div className="text-xs text-gray-500">Оригинальный вопрос</div>
        <div className="text-sm">{ticket.userQuestion}</div>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">Вопрос (редакт.)</label>
        <textarea
          className="w-full border rounded p-2"
          rows={3}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">Ответ (редакт.)</label>
        <textarea
          className="w-full border rounded p-2"
          rows={4}
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await onSave(q, a);
            } finally {
              setLoading(false);
            }
          }}
          className="px-3 py-2 rounded border"
        >
          Сохранить
        </button>
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await onApprove();
            } finally {
              setLoading(false);
            }
          }}
          className="px-3 py-2 rounded bg-green-600 text-white"
        >
          Аппрувнуть
        </button>
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await onDelete();
            } finally {
              setLoading(false);
            }
          }}
          className="px-3 py-2 rounded bg-red-600 text-white"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}


