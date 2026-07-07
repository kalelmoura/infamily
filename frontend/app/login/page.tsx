"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    console.log(email, password);
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
