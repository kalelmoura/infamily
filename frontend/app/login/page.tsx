"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage("E-mail ou senha incorretos.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">

     <h1 className="text-2xl font-semibold tracking-tight"> Acesso Administrativo </h1>

     <form onSubmit={handleSubmit}>
      <input
      className="mt-3 text-sm text-zinc-500"
      type="email"
      placeholder="seu email"
      value={email}
      onChange={(event) => setEmail(event.target.value)}
      />

      <input
      className="mt-3 text-sm text-zinc-500"
      type="password"
      placeholder="sua senha"
      value={password}
      onChange={(event) => setPassword(event.target.value)}
      />

      <button
      type="submit"
      >Entrar </button>

      {errorMessage && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}

      </form>

      <Link
        href="/"
        className="mt-10 text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-600"
      >
        Voltar
      </Link>
    </main>
  );
}
