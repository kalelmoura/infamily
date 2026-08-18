"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api, ApiError } from "@/lib/api";
import { formatMoney, formatSaleDate } from "@/lib/format";
import type {
  Client,
  ClientDetail,
  PaymentMethod,
} from "@/lib/types";

import styles from "./page.module.css";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  fiado: "Fiado",
};

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function clientsPath(query: string): string {
  const trimmed = query.trim();
  return trimmed
    ? `/api/clients?q=${encodeURIComponent(trimmed)}`
    : "/api/clients";
}

export default function ClientesPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <div className={styles.stateCard}>Carregando clientes…</div>
        </main>
      }
    >
      <ClientesPageContent />
    </Suspense>
  );
}

function ClientesPageContent() {
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

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

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
    const timeoutId = window.setTimeout(() => {
      void loadClients(search);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [loadClients, search]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
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

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedFirstName || !trimmedLastName || !trimmedPhone) {
      setFormError("Informe nome, sobrenome e telefone.");
      return;
    }

    setIsSaving(true);
    try {
      const client = await api.post<Client>("/api/clients", {
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        phone: trimmedPhone,
        social_handle: socialHandle.trim() || null,
        notes: notes.trim() || null,
      });

      setFirstName("");
      setLastName("");
      setPhone("");
      setSocialHandle("");
      setNotes("");
      setSearch("");
      await loadClients("");
      router.push(`/clientes?id=${client.id}`);
    } catch (error) {
      setFormError(messageFrom(error, "Não foi possível salvar o cliente."));
    } finally {
      setIsSaving(false);
    }
  }

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
      router.push("/clientes");
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

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Relacionamento</p>
        <h1>Clientes</h1>
        <p>
          Contatos, compras e valores em aberto reunidos em um só lugar.
        </p>
      </header>

      {selectedId === null ? (
        <div className={styles.workspaceGrid}>
          <section className={styles.listPanel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelKicker}>Base de clientes</p>
                <h2>Todos os clientes</h2>
              </div>
              <span className={styles.countBadge}>{clients.length}</span>
            </div>

            <label className={styles.searchField}>
              <span>Buscar por nome ou telefone</span>
              <div>
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Ex.: Maria ou 91999…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setIsLoadingClients(true);
                  }}
                />
              </div>
            </label>

            <div className={styles.listBody}>
              {isLoadingClients && (
                <div className={styles.stateCard}>Buscando clientes…</div>
              )}

              {!isLoadingClients && listError && (
                <div className={`${styles.stateCard} ${styles.errorCard}`}>
                  <p>{listError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoadingClients(true);
                      void loadClients(search);
                    }}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {!isLoadingClients && !listError && clients.length === 0 && (
                <div className={styles.emptyCard}>
                  <span aria-hidden="true">○</span>
                  <p>
                    {search
                      ? "Nenhum cliente encontrado para esta busca."
                      : "Nenhum cliente cadastrado ainda."}
                  </p>
                </div>
              )}

              {!isLoadingClients && !listError && clients.length > 0 && (
                <ul className={styles.clientList}>
                  {clients.map((client) => (
                    <li key={client.id}>
                      <button
                        type="button"
                        className={styles.clientRow}
                        onClick={() => router.push(`/clientes?id=${client.id}`)}
                      >
                        <span className={styles.avatar} aria-hidden="true">
                          {client.first_name.charAt(0).toLocaleUpperCase("pt-BR")}
                        </span>
                        <span className={styles.clientIdentity}>
                          <span className={styles.clientName}>
                            {client.full_name}
                            {client.is_walk_in && (
                              <small>Cliente padrão</small>
                            )}
                          </span>
                          <span className={styles.clientPhone}>{client.phone}</span>
                        </span>
                        <ArrowIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className={styles.formPanel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelKicker}>Novo cadastro</p>
                <h2>Adicionar cliente</h2>
              </div>
            </div>

            <form onSubmit={handleCreate} className={styles.clientForm}>
              <div className={styles.nameGrid}>
                <FormField label="Nome" htmlFor="firstName">
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </FormField>
                <FormField label="Sobrenome" htmlFor="lastName">
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Telefone" htmlFor="phone">
                <input
                  id="phone"
                  type="tel"
                  placeholder="(91) 99999-9999"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </FormField>

              <FormField
                label="Instagram ou Facebook (opcional)"
                htmlFor="socialHandle"
              >
                <input
                  id="socialHandle"
                  type="text"
                  placeholder="@usuario"
                  value={socialHandle}
                  onChange={(event) => setSocialHandle(event.target.value)}
                />
              </FormField>

              <FormField label="Observações (opcional)" htmlFor="notes">
                <textarea
                  id="notes"
                  rows={4}
                  placeholder="Preferências, tamanhos ou lembretes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </FormField>

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSaving}
              >
                {isSaving ? "Salvando…" : "Adicionar cliente"}
              </button>

              {formError && <p className={styles.formError}>{formError}</p>}
            </form>
          </section>
        </div>
      ) : (
        <ClientDetailView
          detail={detail}
          isLoading={isLoadingDetail}
          errorMessage={detailError}
          isDeleting={isDeleting}
          onBack={() => router.push("/clientes")}
          onDelete={() => void handleDelete()}
        />
      )}
    </main>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.formField} htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
    </label>
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
    return <div className={styles.stateCard}>Carregando o cadastro…</div>;
  }

  if (detail === null) {
    return (
      <div className={`${styles.stateCard} ${styles.errorCard}`}>
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
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <circle cx="8.5" cy="8.5" r="5.25" stroke="currentColor" />
      <path d="m12.5 12.5 4 4" stroke="currentColor" strokeLinecap="round" />
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
