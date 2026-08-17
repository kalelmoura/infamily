import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Início" },
  { href: "/estoque", label: "Estoque" },
  { href: "/vendas", label: "Vendas" },
  { href: "/fiado", label: "Fiado" },
  { href: "/resumo", label: "Dashboard" },
];

export default function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
            In Family
          </Link>

          <nav aria-label="Navegação interna">
            <ul className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-full border border-zinc-200 px-4 py-2 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {children}
    </>
  );
}
