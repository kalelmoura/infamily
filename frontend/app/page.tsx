import Link from "next/link";

// Public landing page (/). MVP scope: brand identity + tagline + a discreet
// link to the admin login. No internal data is shown here. The product
// showcase is deliberately deferred (see SPEC §14).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
        inf<span className="text-zinc-400"></span>amily
      </h1>

      <p className="mt-4 text-lg text-zinc-500 sm:text-xl">
        por família – pra família
      </p>

      <Link
        href="/login"
        className="mt-16 text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-600"
      >
        Acesso administrativo
      </Link>
    </main>
  );
}
