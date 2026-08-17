"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatMoney, formatSaleDate } from "@/lib/format";
import type {
  Dashboard,
  DashboardDueSoonFiado,
  DashboardLowStockProduct,
  DashboardOverdueFiado,
} from "@/lib/types";

/** Prefer the API's own message when we have one; otherwise say something useful. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function overdueText(daysOverdue: number): string {
  return daysOverdue === 1 ? "1 dia em atraso" : `${daysOverdue} dias em atraso`;
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-zinc-200 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800">
      {children}
    </p>
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      const data = await api.get<Dashboard>("/api/dashboard");
      setDashboard(data);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        messageFrom(error, "Não foi possível carregar o painel."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadDashboard();
    })();
  }, [loadDashboard]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Veja primeiro o que precisa de atenção hoje.
      </p>

      {isLoading && <p className="mt-8 text-sm text-zinc-500">Carregando…</p>}

      {!isLoading && errorMessage && (
        <div className="mt-8">
          <p className="text-sm text-red-600">{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              void loadDashboard();
            }}
            className="mt-3 text-sm text-zinc-500 underline underline-offset-4"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !errorMessage && dashboard !== null && (
        <div className="mt-8 flex flex-col gap-10">
          <OverdueSection items={dashboard.overdue} />
          <DueSoonSection items={dashboard.due_soon} />
          <LowStockSection items={dashboard.low_stock} />
        </div>
      )}
    </main>
  );
}

function OverdueSection({ items }: { items: DashboardOverdueFiado[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-red-600">
        Em atraso
      </h2>

      <div className="mt-3">
        {items.length === 0 ? (
          <EmptyMessage>Nenhum fiado em atraso.</EmptyMessage>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/fiado?id=${item.id}`}
                  className="block rounded-lg border border-red-200 bg-red-50 px-4 py-4 transition-colors hover:bg-red-100 dark:border-red-950 dark:bg-red-950/40 dark:hover:bg-red-950/70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="min-w-0 truncate font-medium text-red-700 dark:text-red-300">
                      {item.customer_name}
                    </p>
                    <p className="shrink-0 font-semibold text-red-700 dark:text-red-300">
                      {formatMoney(item.remaining_balance)}
                    </p>
                  </div>

                  <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                    Venceu em {formatSaleDate(item.next_due_date)} ·{" "}
                    {overdueText(item.days_overdue)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DueSoonSection({ items }: { items: DashboardDueSoonFiado[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">A vencer</h2>

      <div className="mt-3">
        {items.length === 0 ? (
          <EmptyMessage>Nenhum fiado vencendo nos próximos dias.</EmptyMessage>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/fiado?id=${item.id}`}
                  className="block rounded-lg border border-zinc-200 px-4 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="min-w-0 truncate font-medium">
                      {item.customer_name}
                    </p>
                    <p className="shrink-0 font-medium">
                      {formatMoney(item.remaining_balance)}
                    </p>
                  </div>

                  <p className="mt-2 text-sm text-zinc-500">
                    Próxima parcela em {formatSaleDate(item.next_due_date)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LowStockSection({ items }: { items: DashboardLowStockProduct[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Estoque baixo</h2>

      <div className="mt-3">
        {items.length === 0 ? (
          <EmptyMessage>Estoque sem alertas no momento.</EmptyMessage>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href="/estoque"
                  className="flex items-baseline justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {item.stock_quantity === 0
                        ? "Sem unidades em estoque"
                        : `${item.stock_quantity} ${
                            item.stock_quantity === 1 ? "unidade" : "unidades"
                          } em estoque`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-zinc-500">
                    Ver estoque
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
