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

import styles from "./page.module.css";

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function overdueText(daysOverdue: number): string {
  return daysOverdue === 1 ? "1 dia em atraso" : `${daysOverdue} dias em atraso`;
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 15 15 5M7 5h8v8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.emptyMessage}>
      <span aria-hidden="true">✓</span>
      <p>{children}</p>
    </div>
  );
}

export default function PainelPage() {
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
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Visão do dia</p>
        <h1>Início</h1>
        <p className={styles.subtitle}>
          O que precisa da sua atenção, organizado em um só lugar.
        </p>
      </header>

      {isLoading && (
        <div className={styles.stateCard} role="status">
          <span className={styles.loadingDot} aria-hidden="true" />
          <p>Carregando suas informações…</p>
        </div>
      )}

      {!isLoading && errorMessage && (
        <div className={`${styles.stateCard} ${styles.errorCard}`} role="alert">
          <div>
            <strong>Não foi possível abrir o início.</strong>
            <p>{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              void loadDashboard();
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !errorMessage && dashboard !== null && (
        <div className={styles.sections}>
          <OverdueSection items={dashboard.overdue} />

          <div className={styles.secondaryGrid}>
            <DueSoonSection items={dashboard.due_soon} />
            <LowStockSection items={dashboard.low_stock} />
          </div>
        </div>
      )}
    </main>
  );
}

function OverdueSection({ items }: { items: DashboardOverdueFiado[] }) {
  return (
    <section className={`${styles.section} ${styles.overdueSection}`}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionKicker}>Atenção imediata</p>
          <h2>Em atraso</h2>
        </div>
        <span className={styles.countBadge}>{items.length}</span>
      </header>

      <div className={styles.sectionBody}>
        {items.length === 0 ? (
          <EmptyMessage>Nenhum fiado em atraso.</EmptyMessage>
        ) : (
          <ul className={styles.itemList}>
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/fiado?id=${item.id}`}
                  className={`${styles.itemLink} ${styles.overdueItem}`}
                >
                  <div className={styles.itemContent}>
                    <div className={styles.itemTopline}>
                      <p className={styles.itemName}>{item.customer_name}</p>
                      <p className={styles.itemValue}>
                        {formatMoney(item.remaining_balance)}
                      </p>
                    </div>
                    <div className={styles.itemMeta}>
                      <span>
                        Venceu em {formatSaleDate(item.next_due_date)}
                      </span>
                      <strong>{overdueText(item.days_overdue)}</strong>
                    </div>
                  </div>
                  <span className={styles.itemArrow}>
                    <ArrowIcon />
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

function DueSoonSection({ items }: { items: DashboardDueSoonFiado[] }) {
  return (
    <section className={`${styles.section} ${styles.dueSoonSection}`}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionKicker}>Próximos 7 dias</p>
          <h2>A vencer</h2>
        </div>
        <span className={styles.countBadge}>{items.length}</span>
      </header>

      <div className={styles.sectionBody}>
        {items.length === 0 ? (
          <EmptyMessage>Nenhum fiado vencendo nos próximos dias.</EmptyMessage>
        ) : (
          <ul className={styles.itemList}>
            {items.map((item) => (
              <li key={item.id}>
                <Link href={`/fiado?id=${item.id}`} className={styles.itemLink}>
                  <div className={styles.itemContent}>
                    <div className={styles.itemTopline}>
                      <p className={styles.itemName}>{item.customer_name}</p>
                      <p className={styles.itemValue}>
                        {formatMoney(item.remaining_balance)}
                      </p>
                    </div>
                    <div className={styles.itemMeta}>
                      <span>
                        Próxima parcela em {formatSaleDate(item.next_due_date)}
                      </span>
                    </div>
                  </div>
                  <span className={styles.itemArrow}>
                    <ArrowIcon />
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

function LowStockSection({ items }: { items: DashboardLowStockProduct[] }) {
  return (
    <section className={`${styles.section} ${styles.stockSection}`}>
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionKicker}>Até 2 unidades</p>
          <h2>Estoque baixo</h2>
        </div>
        <span className={styles.countBadge}>{items.length}</span>
      </header>

      <div className={styles.sectionBody}>
        {items.length === 0 ? (
          <EmptyMessage>Estoque sem alertas no momento.</EmptyMessage>
        ) : (
          <ul className={styles.itemList}>
            {items.map((item) => (
              <li key={item.id}>
                <Link href="/estoque" className={styles.itemLink}>
                  <div className={styles.itemContent}>
                    <p className={styles.itemName}>{item.name}</p>
                    <div className={styles.itemMeta}>
                      <span>
                        {item.stock_quantity === 0
                          ? "Sem unidades em estoque"
                          : `${item.stock_quantity} ${
                              item.stock_quantity === 1 ? "unidade" : "unidades"
                            } em estoque`}
                      </span>
                    </div>
                  </div>
                  <span className={styles.itemArrow}>
                    <ArrowIcon />
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
