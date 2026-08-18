"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  formatCents,
  formatMoney,
  formatSaleDate,
  parseMoneyToCents,
} from "@/lib/format";
import type {
  Fiado,
  FiadoDetail,
  FiadoFrequency,
  FiadoStatus,
} from "@/lib/types";

/** Prefer the API's own message when we have one; otherwise say something useful. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

// The backend's domain codes paired with the pt-BR text Yasmin sees. Kept in one
// object each so a label and its code can never drift apart.
const STATUS_LABELS: Record<FiadoStatus, string> = {
  overdue: "Em atraso",
  due_soon: "A vencer",
  current: "Em dia",
  paid_off: "Quitado",
};

// Red for overdue is the whole point of this screen — it is the one thing she
// should be able to spot without reading. Amber warns, neutral reassures, and a
// settled debt fades into the background instead of competing for attention.
const STATUS_BADGE_CLASSES: Record<FiadoStatus, string> = {
  overdue: "bg-red-50 text-red-700",
  due_soon: "bg-amber-50 text-amber-800",
  current: "bg-zinc-100 text-zinc-700",
  paid_off: "bg-zinc-50 text-zinc-400",
};

const FREQUENCY_LABELS: Record<FiadoFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

function StatusBadge({ status }: { status: FiadoStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function FiadoPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
          <p className="text-sm text-zinc-500">Carregando…</p>
        </main>
      }
    >
      <FiadoPageContent />
    </Suspense>
  );
}

function FiadoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const querySelectedId = searchParams.get("id");

  // --- The list -----------------------------------------------------------
  const [fiados, setFiados] = useState<Fiado[]>([]);
  // Starts true: the first fetch is already on its way when the page paints, so
  // she never sees a "ninguém deve nada" flash that isn't true.
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState("");

  // --- The detail ---------------------------------------------------------
  // One page, two views. A separate `/fiado/[id]` route would be the tidier
  // structure, but this screen is one list and one card: keeping both here
  // means opening a customer is instant and going back costs no request.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FiadoDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  // `useCallback` keeps the function identity stable across renders, which
  // matters because the effect below lists it as a dependency. Every setState
  // happens after an await, never synchronously — see the note in the estoque
  // page for why that matters inside an effect.
  const loadFiados = useCallback(async () => {
    try {
      const data = await api.get<Fiado[]>("/api/fiado");
      setFiados(data);
      setListError("");
    } catch (error) {
      setListError(messageFrom(error, "Não foi possível carregar os fiados."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (fiadoId: string) => {
    try {
      const data = await api.get<FiadoDetail>(`/api/fiado/${fiadoId}`);
      setDetail(data);
      setDetailError("");
    } catch (error) {
      setDetailError(
        messageFrom(error, "Não foi possível carregar este fiado."),
      );
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadFiados();
    })();
  }, [loadFiados]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Keep every state update in this effect after an await, matching the
      // pattern used by the other data-loading effects in this repo.
      await Promise.resolve();
      if (cancelled) return;

      if (querySelectedId === null) {
        setSelectedId(null);
        setDetail(null);
        setDetailError("");
        setIsLoadingDetail(false);
        return;
      }

      setSelectedId(querySelectedId);
      setDetail(null);
      setDetailError("");
      setIsLoadingDetail(true);
      void loadDetail(querySelectedId);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadDetail, querySelectedId]);

  function handleOpen(fiado: Fiado) {
    router.push(`/fiado?id=${fiado.id}`);
  }

  function handleBack() {
    router.push("/fiado");
  }

  async function handlePay() {
    if (detail === null) return;

    // A confirmation, as the spec asks for on data-changing actions: this
    // reduces someone's debt and moves their due date, and the MVP has no undo
    // (a payment ledger is deliberately future work). Spelling out the amount
    // and the person makes an accidental tap obvious before it lands.
    const confirmed = window.confirm(
      `Marcar uma parcela de ${formatMoney(detail.installment_amount)} como paga para ${detail.client_name}?`,
    );
    if (!confirmed) return;

    setIsPaying(true);
    setDetailError("");

    try {
      await api.post<Fiado>(`/api/fiado/${detail.id}/pay`, {});
      // Both views are stale now: this fiado's balance and next date changed,
      // and its position in the list may have changed with them (a payment can
      // move someone out of "em atraso"). Refetching both is one extra request
      // for a screen that is never long.
      await Promise.all([loadDetail(detail.id), loadFiados()]);
    } catch (error) {
      setDetailError(
        messageFrom(error, "Não foi possível registrar o pagamento."),
      );
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Fiado</h1>

      {selectedId === null ? (
        /* --- The list (collection screen) ------------------------------- */
        <div className="mt-8">
          {isLoading && <p className="text-sm text-zinc-500">Carregando…</p>}

          {!isLoading && listError && (
            <div>
              <p className="text-sm text-red-600">{listError}</p>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  void loadFiados();
                }}
                className="mt-3 text-sm text-zinc-500 underline underline-offset-4"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!isLoading && !listError && fiados.length === 0 && (
            <p className="text-sm text-zinc-500">
              Nenhuma venda no fiado registrada ainda.
            </p>
          )}

          {!isLoading && !listError && fiados.length > 0 && (
            <ul className="flex flex-col gap-3">
              {/* Already ordered by the API: em atraso first, then a vencer, em
                  dia, and quitado last. The order is derived from today's date,
                  so it belongs on the server with the status itself. */}
              {fiados.map((fiado) => (
                <li key={fiado.id}>
                  {/* A button, not a div with onClick: it is focusable, works
                      with the keyboard and is announced as clickable. */}
                  <button
                    type="button"
                    onClick={() => handleOpen(fiado)}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-4 text-left transition-colors hover:bg-zinc-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="min-w-0 truncate font-medium">
                        {fiado.client_name}
                      </p>
                      <StatusBadge status={fiado.status} />
                    </div>

                    <div className="mt-2 flex flex-col items-start gap-1 min-[420px]:flex-row min-[420px]:items-baseline min-[420px]:justify-between min-[420px]:gap-4">
                      <p className="text-sm text-zinc-500">
                        {fiado.status === "paid_off"
                          ? "Sem parcelas em aberto"
                          : `Próxima parcela em ${formatSaleDate(fiado.next_due_date)}`}
                      </p>
                      <p className="shrink-0 font-medium">
                        {formatMoney(fiado.remaining_balance)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* --- The detail -------------------------------------------------- */
        <div className="mt-8">
          <button
            type="button"
            onClick={handleBack}
            className="text-sm text-zinc-500 underline underline-offset-4"
          >
            ← Voltar para a lista
          </button>

          {isLoadingDetail && (
            <p className="mt-6 text-sm text-zinc-500">Carregando…</p>
          )}

          {!isLoadingDetail && detail === null && detailError && (
            <p className="mt-6 text-sm text-red-600">{detailError}</p>
          )}

          {detail !== null && <FiadoDetailView detail={detail} />}

          {detail !== null && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => void handlePay()}
                // Disabled while in flight — the cheapest way to stop an
                // impatient double-tap from recording two installments — and
                // for a settled debt, where the backend would refuse anyway.
                disabled={isPaying || detail.status === "paid_off"}
                className="w-full rounded-lg bg-zinc-900 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {isPaying ? "Registrando…" : "Marcar parcela como paga"}
              </button>

              {detail.status === "paid_off" && (
                <p className="mt-3 text-sm text-zinc-500">
                  Este fiado já está quitado.
                </p>
              )}

              {/* Shown below the detail (not instead of it) so a failed payment
                  never hides the numbers she was looking at. */}
              {detailError && (
                <p className="mt-3 text-sm text-red-600">{detailError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

/**
 * The detail card: who owes, on what terms, and what they took.
 *
 * Split out purely for readability — the page above was getting long enough
 * that the list and the detail were hard to tell apart at a glance.
 */
function FiadoDetailView({ detail }: { detail: FiadoDetail }) {
  // What has been paid so far. Computed here rather than sent by the API
  // because it is pure presentation: two numbers the response already carries.
  //
  // `parseMoneyToCents` reads the API's "100.00" as 10000 (it accepts both the
  // dot the API sends and the comma a person types), so this subtraction is
  // exact integer arithmetic — the same discipline as the rest of lib/format.
  const totalCents = parseMoneyToCents(detail.sale_total);
  const remainingCents = parseMoneyToCents(detail.remaining_balance);
  const paidCents =
    totalCents === null || remainingCents === null
      ? null
      : totalCents - remainingCents;

  return (
    <div className="mt-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-xl font-semibold tracking-tight">
          {detail.client_name}
        </h2>
        <StatusBadge status={detail.status} />
      </div>

      {/* --- The numbers that matter -------------------------------------- */}
      <div className="mt-6 rounded-lg border border-zinc-200 px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base">Saldo devedor</span>
          <span
            className={`text-xl font-semibold ${
              detail.status === "overdue" ? "text-red-600" : ""
            }`}
          >
            {formatMoney(detail.remaining_balance)}
          </span>
        </div>

        <dl className="mt-4 flex flex-col gap-2 text-sm text-zinc-500">
          <div className="flex flex-col gap-1 min-[390px]:flex-row min-[390px]:justify-between min-[390px]:gap-4">
            <dt>Próxima parcela</dt>
            <dd className={detail.status === "overdue" ? "text-red-600" : ""}>
              {detail.status === "paid_off"
                ? "—"
                : formatSaleDate(detail.next_due_date)}
            </dd>
          </div>
          <div className="flex flex-col gap-1 min-[390px]:flex-row min-[390px]:justify-between min-[390px]:gap-4">
            <dt>Valor da parcela</dt>
            <dd>{formatMoney(detail.installment_amount)}</dd>
          </div>
          <div className="flex flex-col gap-1 min-[390px]:flex-row min-[390px]:justify-between min-[390px]:gap-4">
            <dt>Parcelas</dt>
            <dd>
              {detail.installments_count}× ·{" "}
              {FREQUENCY_LABELS[detail.frequency]}
            </dd>
          </div>
          <div className="flex flex-col gap-1 min-[390px]:flex-row min-[390px]:justify-between min-[390px]:gap-4">
            <dt>Data combinada</dt>
            <dd>{formatSaleDate(detail.agreed_settlement_date)}</dd>
          </div>
          <div className="flex flex-col gap-1 min-[390px]:flex-row min-[390px]:justify-between min-[390px]:gap-4">
            <dt>Já pago</dt>
            <dd>
              {paidCents === null ? "—" : formatCents(paidCents)} de{" "}
              {formatMoney(detail.sale_total)}
            </dd>
          </div>
        </dl>
      </div>

      {/* --- What the person took ----------------------------------------- */}
      <h3 className="mt-8 text-lg font-semibold tracking-tight">
        Peças levadas
      </h3>
      <p className="mt-1 text-sm text-zinc-500">
        Venda de {formatSaleDate(detail.sale_date)}
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {detail.items.map((item) => (
          <li
            key={item.id}
            className="flex items-baseline justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{item.product_name}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {item.quantity} × {formatMoney(item.unit_sale_price)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
