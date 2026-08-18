"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Summary } from "@/lib/types";

/** Prefer the API's own message when we have one; otherwise say something useful. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const inputClassName =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-4 py-3 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500";
const labelClassName = "block text-sm text-zinc-500";

function summaryPath(startDate: string, endDate: string): string {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);

  const query = params.toString();
  return query ? `/api/summary?${query}` : "/api/summary";
}

export default function ResumoPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadSummary = useCallback(async (start: string, end: string) => {
    try {
      const data = await api.get<Summary>(summaryPath(start, end));
      setSummary(data);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        messageFrom(error, "Não foi possível carregar as métricas."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadSummary("", "");
    })();
  }, [loadSummary]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    await loadSummary(startDate, endDate);
  }

  async function handleClearFilter() {
    setStartDate("");
    setEndDate("");
    setIsLoading(true);
    setErrorMessage("");
    await loadSummary("", "");
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Total lucro conta a margem de tudo que foi vendido, incluindo fiado
        ainda não recebido. Recebido é o dinheiro que já entrou. Total custo é
        o custo das peças vendidas mais o custo do estoque atual.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="startDate" className={labelClassName}>
              Data inicial
            </label>
            <input
              id="startDate"
              className={`mt-1 ${inputClassName}`}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className="flex-1">
            <label htmlFor="endDate" className={labelClassName}>
              Data final
            </label>
            <input
              id="endDate"
              className={`mt-1 ${inputClassName}`}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isLoading ? "Carregando…" : "Aplicar filtro"}
          </button>

          <button
            type="button"
            onClick={() => void handleClearFilter()}
            disabled={isLoading || (!startDate && !endDate)}
            className="rounded-lg border border-zinc-300 px-4 py-4 text-base font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Limpar
          </button>
        </div>
      </form>

      {isLoading && summary === null && (
        <p className="mt-8 text-sm text-zinc-500">Carregando…</p>
      )}

      {errorMessage && (
        <p className="mt-8 text-sm text-red-600">{errorMessage}</p>
      )}

      {summary !== null && !errorMessage && (
        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          <SummaryCard label="Total vendido" value={summary.total_sold} />
          <SummaryCard label="Total custo" value={summary.total_cost} />
          <SummaryCard label="Total lucro" value={summary.total_profit} />
          <SummaryCard label="Recebido" value={summary.received} />
          <SummaryCard label="A receber" value={summary.to_receive} />
        </section>
      )}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-5 dark:border-zinc-800">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {formatMoney(value)}
      </p>
    </div>
  );
}
