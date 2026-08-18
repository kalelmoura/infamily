"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import styles from "./layout.module.css";

type NavIconName =
  | "home"
  | "stock"
  | "sales"
  | "clients"
  | "fiado"
  | "metrics";

const navItems: Array<{
  href: string;
  label: string;
  icon: NavIconName;
}> = [
  { href: "/painel", label: "Início", icon: "home" },
  { href: "/estoque", label: "Estoque", icon: "stock" },
  { href: "/vendas", label: "Vendas", icon: "sales" },
  { href: "/clientes", label: "Clientes", icon: "clients" },
  { href: "/fiado", label: "Fiados", icon: "fiado" },
  { href: "/resumo", label: "Métricas", icon: "metrics" },
];

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "home") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="m3.5 10.8 8.5-7 8.5 7v8.7a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-8.7Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9.3 20.5v-5.8h5.4v5.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "stock") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="m4 7.2 8-4 8 4-8 4-8-4Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M4 7.2v9.5l8 4 8-4V7.2M12 11.2v9.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "sales") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="M5.5 4.2h13v15.6l-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4-2.1-1.4-2.2 1.4V4.2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9 8.2h6M9 12h6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "fiado") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <circle
          cx="9"
          cy="8"
          r="3.2"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M3.7 19.5c.45-3 2.35-4.7 5.3-4.7s4.85 1.7 5.3 4.7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M15.5 8.3h4.8M17.9 5.9v4.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "clients") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <rect
          x="4"
          y="3.5"
          width="16"
          height="17"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <circle
          cx="12"
          cy="9"
          r="2.5"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M7.8 17c.45-2.35 1.85-3.55 4.2-3.55s3.75 1.2 4.2 3.55"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M4.2 19.8V13h3.5v6.8H4.2ZM10.3 19.8V8.7h3.5v11.1h-3.5ZM16.4 19.8V4.2h3.5v15.6h-3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function InternalNav() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav
      className={`${styles.nav} ${
        isMobileMenuOpen ? styles.navOpen : ""
      }`}
      aria-label="Navegação interna"
    >
      <button
        type="button"
        className={styles.mobileMenuButton}
        aria-expanded={isMobileMenuOpen}
        aria-controls="internal-navigation-list"
        aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        onClick={() => setIsMobileMenuOpen((current) => !current)}
      >
        <span>Menu</span>
        <span className={styles.mobileMenuIcon} aria-hidden="true">
          <i />
          <i />
        </span>
      </button>

      <ul id="internal-navigation-list" className={styles.navList}>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.navLink} ${
                  isActive ? styles.navLinkActive : ""
                }`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
