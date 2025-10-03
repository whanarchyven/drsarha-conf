import { useEffect, useMemo, useRef } from "react";

type SarahVideoState = "idle" | "stay" | "hello" | "think" | "write";

type SarahVideoProps = {
  state?: SarahVideoState;
  resetVideoState?: () => void;
  onCycle?: (ended: SarahVideoState) => void;
  className?: string;
};

export default function SarahVideo({ state = "idle", resetVideoState, onCycle, className }: SarahVideoProps) {
  const keys = useMemo(() => ["stay", "hello", "think", "write"] as const, []);
  const sources: Record<Exclude<SarahVideoState, "idle">, string> = useMemo(
    () => ({
      stay: "/sarah-video/stay.mp4",
      hello: "/sarah-video/hello.MP4",
      think: "/sarah-video/think.MP4",
      write: "/sarah-video/write.MP4",
    }),
    []
  );

  const refs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    // Pause and reset all
    keys.forEach((k) => {
      const v = refs.current[k];
      if (!v) return;
      if (state !== k) {
        try {
          v.pause();
          v.currentTime = 0;
        } catch {}
      }
    });
    // Play active
    if (state !== "idle") {
      const active = refs.current[state];
      if (active) {
        // ensure it starts visible frame
        try {
          void active.play();
        } catch {}
      }
    }
  }, [state, keys]);

  return (
    <div className={className}>
      <div className="relative w-full h-full">
        {/* Base image */}
        <img src="/sarah-video/idle.png" alt="Sarah idle" className="w-full h-full object-contain" />
        {/* Preloaded videos layered above with cross-fade */}
        {keys.map((k) => (
          <video
            key={k}
            ref={(el) => {
              refs.current[k] = el;
            }}
            src={sources[k]}
            muted
            playsInline
            preload="auto"
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
              state === k ? "opacity-100" : "opacity-0"
            }`}
            onEnded={() => {
              // Prefer cycling callback if provided (e.g., alternate stay<->write)
              if (onCycle) onCycle(k as any);
              else if (k !== "stay" && state === k) resetVideoState?.();
            }}
          />
        ))}
      </div>
    </div>
  );
}