"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { formatMoney, formatSaleDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/sales";
import { normalizeSearchValue } from "@/lib/search";
import type { Sale } from "@/lib/types";

/** Prefer a useful API message over a generic network fallback. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export default function RecentSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [salesError, setSalesError] = useState("");

  const loadSales = useCallback(async () => {
    try {
      const data = await api.get<Sale[]>("/api/sales");
      setSales(data);
      setSalesError("");
    } catch (error) {
      setSalesError(messageFrom(error, "Não foi possível carregar as vendas."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadSales();
    })();
  }, [loadSales]);

  const normalizedQuery = normalizeSearchValue(query);
  const visibleSales = normalizedQuery
    ? sales.filter((sale) => {
        const searchableNames = [
          sale.client_name,
          ...sale.items.map((item) => item.product_name),
        ];
        return searchableNames.some((name) =>
          normalizeSearchValue(name).includes(normalizedQuery),
        );
      })
    : sales;

  const resultLabel = `${visibleSales.length} ${
    visibleSales.length === 1 ? "venda" : "vendas"
  }`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--internal-olive)]">
            Vendas
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Vendas recentes
          </h1>
        </div>

        <Link
          href="/vendas"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[var(--internal-ink)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--internal-olive-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--internal-olive)] min-[520px]:w-auto"
        >
          Registrar venda
        </Link>
      </header>

      <div role="search" className="mt-7 sm:mt-8">
        <label htmlFor="saleSearch" className="block text-sm text-zinc-500">
          Buscar por cliente ou produto
        </label>
        <div className="relative mt-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-zinc-400"
          >
            <circle
              cx="8.5"
              cy="8.5"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="m12.5 12.5 4 4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            id="saleSearch"
            type="search"
            autoComplete="off"
            placeholder="Digite o nome do cliente ou produto"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-transparent py-3 pr-4 pl-12 text-base outline-none transition-colors placeholder:text-zinc-400 focus:border-[var(--internal-olive)]"
          />
        </div>
      </div>

      <section aria-labelledby="sales-history-title" className="mt-7 sm:mt-8">
        <div className="mb-3 flex min-h-6 items-center justify-between gap-4">
          <h2 id="sales-history-title" className="text-sm font-semibold">
            Histórico de vendas
          </h2>
          {!isLoading && !salesError && (
            <p aria-live="polite" className="text-sm text-zinc-500">
              {resultLabel}
            </p>
          )}
        </div>

        {isLoading && (
          <p className="text-sm text-zinc-500" aria-live="polite">
            Carregando…
          </p>
        )}

        {!isLoading && salesError && (
          <div className="rounded-lg border border-red-200 bg-red-50/60 px-4 py-4">
            <p role="alert" className="text-sm text-red-700">
              {salesError}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                void loadSales();
              }}
              className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 underline underline-offset-4 transition-colors hover:bg-red-100"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!isLoading && !salesError && sales.length === 0 && (
          <div className="rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-4 py-6 text-center">
            <p className="text-sm text-zinc-500">
              Nenhuma venda registrada ainda.
            </p>
          </div>
        )}

        {!isLoading &&
          !salesError &&
          sales.length > 0 &&
          visibleSales.length === 0 && (
            <div className="rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-4 py-6 text-center">
              <p className="text-sm text-zinc-500">
                Nenhuma venda encontrada para “{query.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--internal-olive-dark)] underline underline-offset-4 transition-colors hover:bg-white"
              >
                Limpar busca
              </button>
            </div>
          )}

        {!isLoading && !salesError && visibleSales.length > 0 && (
          <ul className="flex flex-col gap-3">
            {visibleSales.map((sale) => (
              <li
                key={sale.id}
                className="rounded-lg border border-zinc-200 px-4 py-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {formatSaleDate(sale.sale_date)}
                  </p>
                  <p className="shrink-0 font-medium">
                    {formatMoney(sale.total_amount)}
                  </p>
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  {sale.client_name} ·{" "}
                  {PAYMENT_METHOD_LABELS[sale.payment_method]}
                </p>

                <ul className="mt-2 text-sm text-zinc-500">
                  {sale.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.product_name} —{" "}
                      {formatMoney(item.unit_sale_price)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
