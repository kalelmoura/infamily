"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { formatMoney, formatSaleDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/sales";
import type { Client, ClientDetail } from "@/lib/types";

import styles from "../page.module.css";

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function clientsPath(query: string): string {
  const trimmed = query.trim();
  return trimmed
    ? `/api/clients?q=${encodeURIComponent(trimmed)}`
    : "/api/clients";
}

export default function AllClientsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
          <p className="text-sm text-zinc-500">Carregando…</p>
        </main>
      }
    >
      <AllClientsPageContent />
    </Suspense>
  );
}

function AllClientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [listError, setListError] = useState("");

  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const loadClients = useCallback(async (query: string) => {
    try {
      const data = await api.get<Client[]>(clientsPath(query));
      setClients(data);
      setListError("");
    } catch (error) {
      setListError(
        messageFrom(error, "Não foi possível carregar os clientes."),
      );
    } finally {
      setIsLoadingClients(false);
    }
  }, []);

  const loadDetail = useCallback(async (clientId: string) => {
    try {
      const data = await api.get<ClientDetail>(`/api/clients/${clientId}`);
      setDetail(data);
      setDetailError("");
    } catch (error) {
      setDetailError(
        messageFrom(error, "Não foi possível carregar este cliente."),
      );
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    // The list is not needed while a profile is open. Once the user returns,
    // the same effect reloads the current search after a short typing debounce.
    if (selectedId !== null) return;

    const timeoutId = window.setTimeout(() => {
      void loadClients(search);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [loadClients, search, selectedId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Keep state updates after an await, matching the loading effects used
      // throughout the internal app.
      await Promise.resolve();
      if (cancelled) return;

      if (selectedId === null) {
        setDetail(null);
        setDetailError("");
        setIsLoadingDetail(false);
        return;
      }

      setDetail(null);
      setDetailError("");
      setIsLoadingDetail(true);
      void loadDetail(selectedId);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadDetail, selectedId]);

  async function handleDelete() {
    if (detail === null || detail.is_walk_in) return;

    const confirmed = window.confirm(
      `Excluir ${detail.full_name}?\n\nClientes com vendas registradas não podem ser excluídos.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setDetailError("");
    try {
      await api.delete(`/api/clients/${detail.id}`);
      router.push("/clientes/todos");
      setDetail(null);
      setIsLoadingClients(true);
      await loadClients(search);
    } catch (error) {
      setDetailError(
        messageFrom(error, "Não foi possível excluir este cliente."),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const resultLabel = `${clients.length} ${
    clients.length === 1 ? "cliente" : "clientes"
  }`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--internal-olive)]">
            Clientes
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Todos os clientes
          </h1>
        </div>

        <Link
          href="/clientes"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[var(--internal-ink)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--internal-olive-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--internal-olive)] min-[520px]:w-auto"
        >
          Adicionar cliente
        </Link>
      </header>

      {selectedId === null ? (
        <>
          <div role="search" className="mt-7 sm:mt-8">
            <label htmlFor="clientSearch" className="block text-sm text-zinc-500">
              Buscar por nome ou telefone
            </label>
            <div className="relative mt-1">
              <SearchIcon />
              <input
                id="clientSearch"
                type="search"
                autoComplete="off"
                placeholder="Digite o nome ou telefone"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setIsLoadingClients(true);
                }}
                className="w-full rounded-lg border border-zinc-300 bg-transparent py-3 pr-4 pl-12 text-base outline-none transition-colors placeholder:text-zinc-400 focus:border-[var(--internal-olive)]"
              />
            </div>
          </div>

          <section aria-labelledby="client-list-title" className="mt-7 sm:mt-8">
            <div className="mb-3 flex min-h-6 items-center justify-between gap-4">
              <h2 id="client-list-title" className="text-sm font-semibold">
                Base de clientes
              </h2>
              {!isLoadingClients && !listError && (
                <p aria-live="polite" className="text-sm text-zinc-500">
                  {resultLabel}
                </p>
              )}
            </div>

            {isLoadingClients && (
              <p className="text-sm text-zinc-500" aria-live="polite">
                Buscando clientes…
              </p>
            )}

            {!isLoadingClients && listError && (
              <div className="rounded-lg border border-red-200 bg-red-50/60 px-4 py-4">
                <p role="alert" className="text-sm text-red-700">
                  {listError}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsLoadingClients(true);
                    void loadClients(search);
                  }}
                  className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 underline underline-offset-4 transition-colors hover:bg-red-100"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {!isLoadingClients && !listError && clients.length === 0 && (
              <div className="rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-4 py-6 text-center">
                <p className="text-sm text-zinc-500">
                  {search
                    ? `Nenhum cliente encontrado para “${search.trim()}”.`
                    : "Nenhum cliente cadastrado ainda."}
                </p>
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setIsLoadingClients(true);
                    }}
                    className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--internal-olive-dark)] underline underline-offset-4 transition-colors hover:bg-white"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            )}

            {!isLoadingClients && !listError && clients.length > 0 && (
              <ul
                className={`${styles.clientList} ${styles.standaloneClientList}`}
              >
                {clients.map((client) => (
                  <li key={client.id}>
                    <button
                      type="button"
                      className={styles.clientRow}
                      onClick={() =>
                        router.push(`/clientes/todos?id=${client.id}`)
                      }
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {client.first_name.charAt(0).toLocaleUpperCase("pt-BR")}
                      </span>
                      <span className={styles.clientIdentity}>
                        <span className={styles.clientName}>
                          {client.full_name}
                          {client.is_walk_in && <small>Cliente padrão</small>}
                        </span>
                        <span className={styles.clientPhone}>{client.phone}</span>
                      </span>
                      <ArrowIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <ClientDetailView
          detail={detail}
          isLoading={isLoadingDetail}
          errorMessage={detailError}
          isDeleting={isDeleting}
          onBack={() => router.push("/clientes/todos")}
          onDelete={() => void handleDelete()}
        />
      )}
    </main>
  );
}

function ClientDetailView({
  detail,
  isLoading,
  errorMessage,
  isDeleting,
  onBack,
  onDelete,
}: {
  detail: ClientDetail | null;
  isLoading: boolean;
  errorMessage: string;
  isDeleting: boolean;
  onBack: () => void;
  onDelete: () => void;
}) {
  if (isLoading) {
    return (
      <div className={`${styles.stateCard} mt-7 sm:mt-8`}>
        Carregando o cadastro…
      </div>
    );
  }

  if (detail === null) {
    return (
      <div
        className={`${styles.stateCard} ${styles.errorCard} mt-7 sm:mt-8`}
      >
        <p>{errorMessage || "Cliente não encontrado."}</p>
        <button type="button" onClick={onBack}>
          Voltar para clientes
        </button>
      </div>
    );
  }

  const hasOutstandingBalance =
    Number.parseFloat(detail.outstanding_fiado_balance) > 0;

  return (
    <div className={styles.detailView}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        ← Voltar para clientes
      </button>

      <section className={styles.profileCard}>
        <div className={styles.profileHeading}>
          <span className={styles.profileAvatar} aria-hidden="true">
            {detail.first_name.charAt(0).toLocaleUpperCase("pt-BR")}
          </span>
          <div>
            <p className={styles.panelKicker}>Cadastro do cliente</p>
            <h2>{detail.full_name}</h2>
            {detail.is_walk_in && <span>Cliente padrão da loja</span>}
          </div>
        </div>

        <dl className={styles.contactGrid}>
          <div>
            <dt>Telefone</dt>
            <dd>{detail.phone}</dd>
          </div>
          <div>
            <dt>Rede social</dt>
            <dd>{detail.social_handle || "Não informada"}</dd>
          </div>
          <div className={styles.notesItem}>
            <dt>Observações</dt>
            <dd>{detail.notes || "Nenhuma observação."}</dd>
          </div>
        </dl>

        {!detail.is_walk_in && (
          <button
            type="button"
            className={styles.deleteButton}
            disabled={isDeleting}
            onClick={onDelete}
          >
            {isDeleting ? "Excluindo…" : "Excluir cliente"}
          </button>
        )}

        {errorMessage && <p className={styles.formError}>{errorMessage}</p>}
      </section>

      <section
        className={`${styles.balanceCard} ${
          hasOutstandingBalance ? styles.balanceOpen : styles.balanceClear
        }`}
      >
        <div>
          <p>Fiado em aberto</p>
          <strong>{formatMoney(detail.outstanding_fiado_balance)}</strong>
        </div>
        <span>
          {hasOutstandingBalance
            ? "Valor que ainda falta receber deste cliente."
            : "Nenhum valor pendente."}
        </span>
      </section>

      <section className={styles.historySection}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.panelKicker}>Histórico</p>
            <h2>Compras do cliente</h2>
          </div>
          <span className={styles.countBadge}>
            {detail.sales_history.length}
          </span>
        </div>

        {detail.sales_history.length === 0 ? (
          <div className={styles.emptyCard}>
            <span aria-hidden="true">✓</span>
            <p>Nenhuma compra registrada para este cliente.</p>
          </div>
        ) : (
          <ul className={styles.historyList}>
            {detail.sales_history.map((sale) => (
              <li key={sale.id} className={styles.historyCard}>
                <div className={styles.saleTopline}>
                  <div>
                    <strong>{formatSaleDate(sale.sale_date)}</strong>
                    <span>{PAYMENT_METHOD_LABELS[sale.payment_method]}</span>
                  </div>
                  <strong>{formatMoney(sale.total_amount)}</strong>
                </div>
                <ul>
                  {sale.items.map((item) => (
                    <li key={item.id}>
                      <span>
                        {item.quantity} × {item.product_name}
                      </span>
                      <span>{formatMoney(item.unit_sale_price)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SearchIcon() {
  return (
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
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path
        d="M5 15 15 5M7 5h8v8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
