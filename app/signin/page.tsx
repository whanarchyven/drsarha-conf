"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const upsertProfile = useMutation(api.quiz.upsertProfile);
  return (
    <div className="flex flex-col md:flex-row-reverse items-center min-h-screen overflow-hidden md:overflow-visible">
      <div className="hidden md:flex w-1/2 items-center self-end justify-center items-end bg-white">
        <img src="/hello_sara_login2.PNG" alt="Mascot" className="max-w-[480px] w-full h-auto" />
      </div>
      <div className="flex-1 flex flex-col gap-8 max-w-md mx-auto w-full h-full justify-center items-center p-8 pb-4 md:pb-8">
        <h1 className="text-2xl font-bold">{flow === "signIn" ? "Вход" : "Регистрация"}</h1>
        <p className="text-slate-600 text-center text-sm max-w-sm">
          Привет участник конференции! <br /> Пожалуйста, {flow === "signIn" ? "войдите" : "зарегистрируйтесь"} для участия в квизах
        </p>
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target as HTMLFormElement);
          formData.set("flow", flow);
          void signIn("password", formData)
            .then(async () => {
              if (flow === "signUp") {
                const fullName = (e.currentTarget.elements.namedItem("fullName") as HTMLInputElement)?.value ?? "";
                const phone = (e.currentTarget.elements.namedItem("phone") as HTMLInputElement)?.value ?? "";
                const specialization = (e.currentTarget.elements.namedItem("specialization") as HTMLInputElement)?.value ?? "";
                // Подождать применение cookie
                await new Promise((r) => setTimeout(r, 200));
                // Пытаться до 10 раз в течение ~3с
                let lastErr: unknown = null;
                for (let i = 0; i < 10; i++) {
                  try {
                    await upsertProfile({ fullName, phone, specialization });
                    lastErr = null;
                    break;
                  } catch (err) {
                    lastErr = err;
                    await new Promise((r) => setTimeout(r, 300));
                  }
                }
                if (lastErr) {
                  console.warn("Failed to upsert profile after sign up", lastErr);
                }
              }
              router.push("/");
            })
            .catch((error) => {
              setError(error.message);
            });
        }}
      >
        <input
          className="bg-white text-foreground text-sm w-full rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="email"
          name="email"
          placeholder="Email"
        />
        {flow === "signUp" && (
          <>
            <input
              className="bg-background text-foreground w-full text-sm rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
              type="text"
              name="fullName"
              placeholder="ФИО"
            />
            <input
              className="bg-background text-foreground w-full text-sm rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
              type="tel"
              name="phone"
              placeholder="Телефон"
            />
            <input
              className="bg-background text-foreground w-full text-sm rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
              type="text"
              name="specialization"
              placeholder="Специализация"
            />
          </>
        )}
        <input
          className="bg-background text-foreground w-full text-sm rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="password"
          name="password"
          placeholder="Password"
        />
        <button
          className="bg-teal-600 h-10 cursor-pointer w-full hover:bg-teal-700 transition-colors text-white rounded-md"
          type="submit"
        >
          {flow === "signIn" ? "Войти" : "Зарегистрироваться"}
        </button>
        <div className="flex justify-center flex-row gap-2 text-sm">
          <span>
            {flow === "signIn"
              ? "Впервые здесь?"
              : "Уже зарегистрированы?"}
          </span>
          <span
            className="text-teal-700 underline cursor-pointer hover:no-underline hover:text-teal-800 transition-colors"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Зарегистрироваться" : "Войти"}
          </span>
        </div>
        {error && (
          <div className="bg-red-500/20 border-2 border-red-500/50 rounded-md p-2">
            <p className="text-foreground font-mono text-xs">
              Error signing in: {error}
            </p>
          </div>
        )}
      </form>
      <img src="/logo.svg" alt="Logo" className="w-32 h-auto" />
      </div>
      {/* Мобильный маскот: под формой, всегда обрезается экраном снизу */}
      <div className="md:hidden w-54 mt-auto overflow-hidden">
        <img
          src={flow === "signIn" ? "/hello_sara_login2.PNG" : "/hello_sara.png"}
          alt="Mascot"
          className="w-full object-bottom"
        />
      </div>
    </div>
  );
}
