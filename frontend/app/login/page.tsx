"use client";

import { useState } from "react";
import Link from "next/link";
import { Newsreader } from "next/font/google";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase";

import styles from "./page.module.css";

const editorialFont = Newsreader({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});

function EyeIcon({ passwordVisible }: { passwordVisible: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.8 12s3.35-5 9.2-5 9.2 5 9.2 5-3.35 5-9.2 5-9.2-5-9.2-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      {passwordVisible && (
        <path
          d="m4.5 4.5 15 15"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage("E-mail ou senha incorretos.");
        setIsSubmitting(false);
        return;
      }

      // Replace keeps the login screen out of the browser history after entry.
      router.replace("/painel");
    } catch {
      setErrorMessage(
        "Não foi possível entrar. Verifique sua conexão e tente novamente.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <main className={`${styles.page} ${editorialFont.variable}`}>
      <section className={styles.loginShell} aria-labelledby="login-title">
        <aside className={styles.brandPanel}>
          <Link
            href="/"
            className={styles.brandLink}
            aria-label="Voltar à página inicial da In family"
          >
            In family
          </Link>

          <div className={styles.brandCopy}>
            <p>Gestão simples</p>
            <h2>
              <span>Suas métricas</span>
              <span>estoque e base de clientes</span>
              <span>tudo em um só lugar.</span>
            </h2>
          </div>
        </aside>

        <div className={styles.formPanel}>
          <div className={styles.formContent}>
            <h1 id="login-title">Olá, Yasmin</h1>
            <p className={styles.intro}>Entre para acompanhar sua loja.</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Digite seu e-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={errorMessage ? "login-error" : undefined}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="password">Senha</label>
                <div className={styles.passwordField}>
                  <input
                    id="password"
                    name="password"
                    type={passwordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(errorMessage)}
                    aria-describedby={errorMessage ? "login-error" : undefined}
                    disabled={isSubmitting}
                    required
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    aria-label={
                      passwordVisible ? "Ocultar senha" : "Mostrar senha"
                    }
                    aria-pressed={passwordVisible}
                    disabled={isSubmitting}
                  >
                    <EyeIcon passwordVisible={passwordVisible} />
                  </button>
                </div>
              </div>

              {errorMessage && (
                <p id="login-error" className={styles.error} role="alert">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
