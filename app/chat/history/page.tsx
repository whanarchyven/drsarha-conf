"use client";
import { useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import SarahVideo from "@/components/SarahVideo";
import { AnimatePresence, motion } from "framer-motion";
import SplitText from "@/components/SplitText";
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ChatHistoryPage() {
  const items = useQuery(api.chat.listHistory, { limit: 20 }) ?? [];
  const rows = [...items].reverse();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const outerScrollRef = useRef<HTMLDivElement | null>(null);
  const [videoState, setVideoState] = useState<"idle" | "stay" | "hello" | "think" | "write">("stay");
  const [overlay, setOverlay] = useState<{ q: string; a: string } | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const phrases = useQuery(api.chat.listPhrases, {}) ?? [];
  const settings = useQuery(api.chat.getSettings, {});
  const nextAnnouncement = useQuery(api.chat.nextAnnouncement, {});
  const consumeAnnouncement = useMutation(api.chat.consumeAnnouncement);
  const phraseIdxRef = useRef<number>(0);
  const hideTimerRef = useRef<any>(null);
  const currentPhraseIdRef = useRef<string | null>(null);
  const [speechVisible, setSpeechVisible] = useState<boolean>(false);
  const [speechText, setSpeechText] = useState<string>("");

  function getSizeClassByLength(len: number, kind: "overlay" | "bubble"): string {
    // Простая эвристика по длине текста
    if (kind === "overlay") {
      if (len <= 160) return "text-2xl";
      if (len <= 320) return "text-xl";
      if (len <= 700) return "text-lg";
      if (len <= 1200) return "text-base";
      return "text-sm";
    }
    // bubble
    if (len <= 140) return "text-base md:text-lg";
    if (len <= 300) return "text-sm md:text-base";
    if (len <= 600) return "text-sm";
    return "text-xs";
  }

  useEffect(() => {
    const el = outerScrollRef.current ?? scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items]);

  // Detect new message -> show fullscreen overlay, then play write
  useEffect(() => {
    if (!items || items.length === 0) return;
    const latest: any = items[0];
    if (!latest) return;
    const latestId = String(latest._id);
    if (lastIdRef.current !== latestId) {
      lastIdRef.current = latestId;
      setVideoState("idle");
      setOverlay({ q: latest.question, a: latest.answer });
      const t = setTimeout(() => {
        setOverlay(null);
        setVideoState("write");
      }, 10000);
      return () => clearTimeout(t);
    }
  }, [items]);

  // Polling-like display: show queued announcement if exists, else rotate visible phrases by settings.intervalMs
  useEffect(() => {
    if (overlay) return;
    let timer: any;
    async function showOne(text: string, ms: number, opts?: { phraseId?: string | null }) {
      setSpeechText(text);
      setSpeechVisible(true);
      currentPhraseIdRef.current = opts?.phraseId ?? null;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      await new Promise<void>((resolve) => {
        hideTimerRef.current = setTimeout(() => {
          setSpeechVisible(false);
          hideTimerRef.current = null;
          resolve();
        }, Math.max(500, ms));
      });
    }
    async function loop() {
      // Priority: queued announcement
      if (nextAnnouncement) {
        await showOne(nextAnnouncement.text, nextAnnouncement.durationMs, { phraseId: null });
        await consumeAnnouncement({ id: nextAnnouncement._id as Id<"chatAnnouncements"> });
      } else {
        let pool = (phrases ?? []).filter((p: any) => p.visible);
        if (pool.length > 0) {
          if (settings?.randomize) {
            const r = Math.floor(Math.random() * pool.length);
            const p = pool[r];
            await showOne(p.text, p.durationMs, { phraseId: String(p._id) });
          } else {
            pool = pool.sort((a: any, b: any) => a.order - b.order);
            const idx = phraseIdxRef.current % pool.length;
            phraseIdxRef.current += 1;
            const p = pool[idx];
            await showOne(p.text, p.durationMs, { phraseId: String(p._id) });
          }
        }
      }
      const interval = Math.max(500, settings?.intervalMs ?? 5000);
      timer = setTimeout(loop, interval);
    }
    timer = setTimeout(loop, 600); // small delay before first
    return () => clearTimeout(timer);
  }, [overlay, phrases, settings, nextAnnouncement, consumeAnnouncement]);

  // If current phrase becomes invisible, hide immediately
  useEffect(() => {
    const currentId = currentPhraseIdRef.current;
    if (!currentId) return;
    const p = (phrases ?? []).find((x: any) => String(x._id) === currentId);
    if (p && !p.visible) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
      setSpeechVisible(false);
      currentPhraseIdRef.current = null;
    }
  }, [phrases]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="relative w-[1100px] h-[1152px] rounded-2xl border shadow overflow-hidden bg-white">
        {/* Sarah bottom-left */}
        <SarahVideo
          state={videoState}
          resetVideoState={() => setVideoState("stay")}
          onCycle={(ended) => {
            if (ended === "write") {
              setVideoState("stay");
              return;
            }
            if (overlay) return; // pause loop during overlay
            if (ended === "stay") setVideoState("hello");
            else if (ended === "hello") setVideoState("stay");
          }}
          className="absolute left-0 bottom-0 h-[360px]"
        />

        {/* Sarah speech bubble (appears when hello starts) */}
        <div className={`absolute bottom-60 left-60 transition-all duration-300 ${speechVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}>
          <div className="relative bg-white border border-slate-200 text-black rounded-2xl px-4 py-3 shadow-sm max-w-xs">
            <div className="text-sm leading-snug">{speechText}</div>
            {/* tail */}
            <div className="absolute left-[-10px] bottom-4 w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-slate-200" />
            <div className="absolute left-[-9px] bottom-4 w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-slate-50" />
          </div>
        </div>

        {/* Dialogs pinned to top with reserved bottom space for Sarah */}
        <div ref={outerScrollRef} className="absolute left-0 right-0 top-0 p-6 pt-8 flex flex-col overflow-y-scroll items-center justify-start" style={{ bottom: "380px" }}>
          <div className="w-full max-w-4xl rounded-2xl border bg-white/95 backdrop-blur p-4 shadow-sm">
            <div ref={scrollRef} className="space-y-5 overflow-auto pr-2" style={{ maxHeight: "100%" }}>
              {rows.map((x: any) => (
                <div key={String(x._id)} className="space-y-3">
                  {/* User question bubble (left) */}
                  <div className="flex items-start gap-3">
                    <img src="/user_avatar.png" alt="user" className="w-8 h-8 rounded-full object-cover mt-1" />
                    <div className="relative max-w-[75%] bg-white border border-slate-200 text-slate-900 rounded-2xl px-4 py-3 shadow-sm">
                      <div className="text-[11px] md:text-xs text-slate-400 mb-1">Пользователь спрашивает:</div>
                      <div className="text-sm md:text-base whitespace-pre-wrap">{x.question}</div>
                      {/* tail */}
                      <div className="absolute left-[-8px] top-4 w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-white" />
                      <div className="absolute left-[-9px] top-4 w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-slate-200" />
                    </div>
                  </div>
                  {/* Sara answer bubble (right) */}
                  <div className="flex items-start gap-3 justify-end">
                  <div className="relative max-w-[75%] text-white rounded-2xl px-4 py-3 shadow-sm" style={{ backgroundColor: "#18bbac" }}>
                      <div className="text-[11px] md:text-xs text-white/80 mb-1">Доктор Сара отвечает:</div>
                    <div className={`${getSizeClassByLength((x.answer?.length ?? 0), "bubble")} font-bold whitespace-pre-line leading-snug`}>
                        <Markdown remarkPlugins={[remarkGfm]} >{x.answer}</Markdown>
                      </div>
                      {/* tail */}
                      <div className="absolute right-[-8px] top-4 w-0 h-0 border-y-8 border-y-transparent border-l-8" style={{ borderLeftColor: "#18bbac" }} />
                    </div>
                    <img src="/sarah_avatar.png" alt="sarah" className="w-8 h-8 rounded-full object-cover mt-1" />
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="text-slate-500 text-sm">Пока нет диалогов</div>
              )}
            </div>
          </div>
        </div>
        {overlay && (
          <AnimatePresence mode="wait">
            {/* Backdrop fade */}
            <motion.div
              key="backdrop"
              className="absolute inset-0 bg-black/50 backdrop-blur w-screen h-screen top-0 left-0 z-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
            {/* Modal scale from center */}
            <motion.div
              key="modal"
              className="absolute inset-0 flex items-center justify-center p-6 z-20"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              role="dialog"
              aria-modal="true"
            >
              <div className="max-w-2xl w-full space-y-4 p-6 rounded-2xl border bg-white/95 backdrop-blur shadow-xl flex flex-col gap-4 items-center">
              <SplitText
                  text={'Пользователь спрашивает:'}
                  className="text-2xl font-semibold text-center"
                  delay={500}
                  duration={2}
                  ease="elastic.out(1, 0.3)"
                  splitType="words"
                  from={{ opacity: 0, y: 40 }}
                  to={{ opacity: 1, y: 0 }}
                  threshold={0.1}
                  rootMargin="-100px"
                  textAlign="center"
                  onLetterAnimationComplete={() => {}}
                />
                <motion.div className="flex justify-center items-center p-2 rounded-2xl bg-[#18bbac]"
                  initial={{ opacity: 0, y: -40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeInOut", delay: 1 }}
                >
                  <div className="text-2xl font-semibold text-white">“{overlay.q}”</div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: -40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeInOut", delay: 1.5 }}
                >
                  
                <SplitText
                  text={'Доктор Сара отвечает:'}
                  className="text-2xl font-semibold text-center"
                  delay={500}
                  duration={2}
                  ease="elastic.out(1, 0.3)"
                  splitType="words"
                  from={{ opacity: 0, y: 40 }}
                  to={{ opacity: 1, y: 0 }}
                  threshold={0.1}
                  rootMargin="-100px"
                  textAlign="center"
                  onLetterAnimationComplete={() => {}}
                />
                </motion.div>
                <motion.div className="flex justify-center items-center p-2 rounded-2xl" style={{ backgroundColor: "#18bbac" }}
                  initial={{ opacity: 0, y: -40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeInOut", delay: 2 }}
                >
                  <div className={`${getSizeClassByLength((overlay?.a?.length ?? 0), "overlay")} font-semibold text-white leading-snug text-center`}>
                 
                  <Markdown remarkPlugins={[remarkGfm]}  >{overlay.a}</Markdown>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
        
      </div>
      <div className="absolute bottom-6 right-10 flex items-end flex-col gap-2">
          <img src="/7.png" alt="QR" className="w-40 aspect-square" />
          <p className="text-sm font-semibold text-[#18bbac]">Задай мне вопрос!</p>
        </div>
    </div>
  );
}


