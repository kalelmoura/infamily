"use client";

import Link from "next/link";
import { useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { Client } from "@/lib/types";

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const inputClassName =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-4 py-3 text-base outline-none focus:border-zinc-500";
const labelClassName = "block text-sm text-zinc-500";

export default function ClientesPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedFirstName || !trimmedLastName || !trimmedPhone) {
      setFormError("Informe nome, sobrenome e telefone.");
      return;
    }

    setIsSaving(true);
    try {
      await api.post<Client>("/api/clients", {
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
      setFormSuccess("Cliente adicionado com sucesso.");
    } catch (error) {
      setFormError(messageFrom(error, "Não foi possível salvar o cliente."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cadastre um novo cliente.
          </p>
        </div>

        <Link
          href="/clientes/todos"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-5 text-sm font-semibold text-[var(--internal-ink)] transition-colors hover:border-[var(--internal-olive)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--internal-olive)] min-[520px]:w-auto"
        >
          Todos os clientes
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4"
          >
            <path
              d="M4 10h12m-4-4 4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </header>

      <form onSubmit={handleCreate} className="mt-7 flex flex-col gap-4 sm:mt-8">
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <div>
            <label htmlFor="firstName" className={labelClassName}>
              Nome
            </label>
            <input
              id="firstName"
              className={`mt-1 ${inputClassName}`}
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="lastName" className={labelClassName}>
              Sobrenome
            </label>
            <input
              id="lastName"
              className={`mt-1 ${inputClassName}`}
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className={labelClassName}>
            Telefone
          </label>
          <input
            id="phone"
            className={`mt-1 ${inputClassName}`}
            type="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="socialHandle" className={labelClassName}>
            Instagram ou Facebook (opcional)
          </label>
          <input
            id="socialHandle"
            className={`mt-1 ${inputClassName}`}
            type="text"
            placeholder="@usuario"
            value={socialHandle}
            onChange={(event) => setSocialHandle(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="notes" className={labelClassName}>
            Observações (opcional)
          </label>
          <textarea
            id="notes"
            className={`mt-1 min-h-28 resize-y ${inputClassName}`}
            rows={4}
            placeholder="Preferências, tamanhos ou lembretes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          disabled={isSaving}
        >
          {isSaving ? "Salvando…" : "Adicionar cliente"}
        </button>

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}
        {formSuccess && (
          <p role="status" className="text-sm text-emerald-700">
            {formSuccess}
          </p>
        )}
      </form>
    </main>
  );
}
