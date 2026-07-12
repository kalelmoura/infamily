"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  // Controlled-input state for the email/password fields.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Holds the message shown to the user after a failed login attempt.
  const [errorMessage, setErrorMessage] = useState("");
  // Lets us redirect programmatically after a successful login.
  const router = useRouter();

  // Runs when the form is submitted (Enter key or the "Entrar" button).
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Stop the browser's default full-page form submission/reload.
    event.preventDefault();
    // Clear any error left over from a previous failed attempt.
    setErrorMessage("");

    // Supabase client used to call Auth on the client side.
    const supabase = createClient();
    // Attempt to sign in with email + password against Supabase Auth.
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Generic message on purpose: don't reveal whether the email exists.
      setErrorMessage("E-mail ou senha incorretos.");
      return;
    }

    // Successful login: send the admin to the protected dashboard.
    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">

     <h1 className="text-2xl font-semibold tracking-tight"> Acesso Administrativo </h1>

     {/* Native <form> so Enter submits and onSubmit fires handleSubmit above. */}
     <form onSubmit={handleSubmit}>
      {/* Controlled email input: value/onChange keep it in sync with state. */}
      <input
      className="mt-3 text-sm text-zinc-500"
      type="email"
      placeholder="seu email"
      value={email}
      onChange={(event) => setEmail(event.target.value)}
      />

      {/* Controlled password input; type="password" masks the characters. */}
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

      {/* Only rendered once handleSubmit sets a non-empty errorMessage. */}
      {errorMessage && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}

      </form>

      {/* Escape hatch back to the public landing page. */}
      <Link
        href="/"
        className="mt-10 text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-600"
      >
        Voltar
      </Link>
    </main>
  );
}
