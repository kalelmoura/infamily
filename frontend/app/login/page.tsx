import Link from "next/link";

// Admin login (/login). Placeholder for Phase 0 — the Supabase Auth form
// (email + password, session via @supabase/ssr) is built in Phase 1.
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>

      <p className="mt-3 text-sm text-zinc-500">Login indisponível no momento..</p>

      <Link
        href="/"
        className="mt-10 text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-600"
      >
        Voltar
      </Link>
    </main>
  );
}
