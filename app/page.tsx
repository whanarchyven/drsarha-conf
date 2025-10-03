"use client";

import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-white p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <img src="/logo.svg" alt="Logo" className="w-20 h-auto" />
        <SignOutButton />
      </header>
      <main className="p-6 md:p-8 flex flex-col gap-8">
        <Content />
      </main>
    </>
  );
}

function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <>
      {isAuthenticated && (
        <button
          className="bg-teal-600 text-white text-sm rounded-md px-2 py-1"
          onClick={() =>
            void signOut().then(() => {
              router.push("/signin");
            })
          }
        >
          Выйти
        </button>
      )}
    </>
  );
}

function Content() {
  return (
    <div className="flex flex-col items-center gap-6 md:gap-8 max-w-2xl mx-auto text-center">
      <h1 className="text-2xl md:text-4xl font-bold">Привет, участник конференции!</h1>
      <p className="text-slate-600 text-sm md:text-base">Выберите раздел, чтобы продолжить.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        <Link href="/quiz" className="flex items-center justify-center rounded-xl border p-4 bg-white hover:shadow transition">
          <span className="font-semibold" style={{ color: "#18bbac" }}>Квизы</span>
        </Link>
        
        <Link href="/chat" className="flex items-center justify-center rounded-xl border p-4 bg-white hover:shadow transition">
          <span className="font-semibold" style={{ color: "#18bbac" }}>Чат с Сарой</span>
        </Link>
        <Link href="https://forms.yandex.ru/u/68dcfd5884227c2a79b6ac71" className="flex items-center justify-center rounded-xl border p-4 bg-white hover:shadow transition">
          <span className="font-semibold" style={{ color: "#18bbac" }}>Запись на бета-тест мобильного приложения «Доктор Сара»</span>
        </Link>
      </div>
    </div>
  );
}
