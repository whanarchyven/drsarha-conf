"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ChatUserPage() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const active = useQuery(api.chat.getUserActiveTicket, {});
  const submit = useMutation(api.chat.submitQuestion);
  const [currentTicket, setCurrentTicket] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (active && (active.status === "queued" || active.status === "awaiting_moderation")) {
      setCurrentTicket(active.ticketId as unknown as string);
    }
  }, [active]);

  const positionArgs = useMemo(() => (currentTicket ? { ticketId: currentTicket } : undefined), [currentTicket]);
  const position = useQuery(api.chat.getQueuePosition, positionArgs as any);
  const hasActiveQueued = active && (active.status === "queued" || active.status === "awaiting_moderation");
  const canSend = text.trim().length > 0 && !hasActiveQueued;

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 200);
    el.style.height = next + "px";
  };

  useEffect(() => {
    autoResize();
  }, [text]);

  const onSend = async () => {
    if (!text.trim()) return;
    const id = await submit({ userQuestion: text.trim() });
    setCurrentTicket(id);
    setText("");
  };

  return (
    <div className="min-h-screen flex items-center relative justify-center">
      <div className="absolute left-6 top-6">
        <ArrowLeftIcon
          className="w-6 h-6 text-[#18bbac]"
          onClick={() => router.back()}
        />
      </div>
      <div className="w-full max-w-3xl p-6">
        {/* Header logo */}

        <div className="flex items-center justify-center mb-6">
          <img src="/sarah_avatar.png" alt="Doctor Sarah" className="w-32" />
        </div>

        <div className="flex items-center justify-center mb-6">
          <img src="/logo.svg" alt="Doctor Sarah" className="h-10" />
        </div>

        {!hasActiveQueued ? (
          <div className="space-y-3">
            <p className="text-center text-slate-600">Задай мне вопрос!</p>
            <div className="relative rounded-2xl border bg-white shadow-sm p-2">
              <textarea
                ref={textareaRef}
                className="w-full resize-none bg-transparent outline-none text-base md:text-lg leading-6 md:leading-7 px-3 py-2 pr-12"
                rows={1}
                placeholder="Ваш вопрос..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onInput={autoResize}
              />
              {canSend && (
                <button
                  onClick={onSend}
                  aria-label="Отправить"
                  className="absolute right-3 bottom-3 h-9 w-9 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor: "#18bbac" }}
                >
                  {/* Paper plane icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-2xl border bg-white shadow-sm space-y-2 text-center">
            
            <p className="font-medium">Спасибо за ваш вопрос!</p>
            <p>Ваша позиция в очереди: <b>{position? position+1 : "..."}</b></p>
            <p className="text-sm text-slate-600">Когда ответ будет готов, он появится в истории, и вы сможете задать следующий вопрос.</p>
          </div>
        )}
      </div>
    </div>
  );
}


