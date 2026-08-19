"use client";

import Link from "next/link";
import { useState } from "react";

import { api, ApiError } from "@/lib/api";
// Money parsing and formatting moved to lib/format.ts once the vendas page
// needed the same rules — two copies of money handling would eventually drift.
import { parseMoneyInput, parseQuantityInput } from "@/lib/format";
import type { Product } from "@/lib/types";

/** Prefer the API's own message when we have one; otherwise say something useful. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

// Repeated Tailwind strings, named once so the JSX below stays readable and
// every field keeps the same generous touch target.
const inputClassName =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-4 py-3 text-base outline-none focus:border-zinc-500";
const labelClassName = "block text-sm text-zinc-500";

export default function EstoquePage() {
  // --- The "add product" form --------------------------------------------
  // Controlled inputs, all stored as strings — that is what an <input> holds.
  // Parsing happens once, on submit.
  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Stop the browser's native submit, which would reload the whole page.
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    const trimmedName = name.trim();
    const cost = parseMoneyInput(costPrice);
    const sale = parseMoneyInput(salePrice);
    const quantity = parseQuantityInput(stockQuantity);

    // Validating here is about giving a good message instantly — it is not the
    // safeguard. The Pydantic schema and the table's CHECK constraints are;
    // this can be bypassed, they cannot.
    if (!trimmedName) {
      setFormError("Informe o nome do produto.");
      return;
    }
    if (cost === null) {
      setFormError("Informe um preço de custo válido. Exemplo: 49,90");
      return;
    }
    if (sale === null) {
      setFormError("Informe um preço de venda válido. Exemplo: 79,90");
      return;
    }
    if (quantity === null) {
      setFormError("Informe uma quantidade válida (número inteiro).");
      return;
    }

    setIsSaving(true);
    try {
      await api.post<Product>("/api/products", {
        // Keys are snake_case to match the backend schema exactly — an unknown
        // key would be rejected outright (`extra="forbid"`).
        name: trimmedName,
        cost_price: cost,
        sale_price: sale,
        stock_quantity: quantity,
      });

      setName("");
      setCostPrice("");
      setSalePrice("");
      setStockQuantity("");
      setFormSuccess("Produto adicionado com sucesso.");
    } catch (error) {
      setFormError(messageFrom(error, "Não foi possível salvar o produto."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cadastre uma nova peça no estoque.
          </p>
        </div>

        <Link
          href="/estoque/produtos"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-5 text-sm font-semibold text-[var(--internal-ink)] transition-colors hover:border-[var(--internal-olive)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--internal-olive)] min-[480px]:w-auto"
        >
          Produtos
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

      {/* --- Add a product ------------------------------------------------ */}
      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4 sm:mt-8">
        <div>
          <label htmlFor="name" className={labelClassName}>
            Nome do produto
          </label>
          <input
            id="name"
            className={`mt-1 ${inputClassName}`}
            type="text"
            placeholder="Camiseta branca"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <div>
            <label htmlFor="costPrice" className={labelClassName}>
              Preço de custo
            </label>
            {/* type="text" + inputMode="decimal", not type="number": a number
                input silently discards a value typed with a comma, which is
                exactly how a Brazilian writes prices. inputMode still brings
                up the numeric keypad on a phone. */}
            <input
              id="costPrice"
              className={`mt-1 ${inputClassName}`}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="salePrice" className={labelClassName}>
              Preço de venda
            </label>
            <input
              id="salePrice"
              className={`mt-1 ${inputClassName}`}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="stockQuantity" className={labelClassName}>
            Quantidade
          </label>
          <input
            id="stockQuantity"
            className={`mt-1 ${inputClassName}`}
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={stockQuantity}
            onChange={(event) => setStockQuantity(event.target.value)}
          />
        </div>

        <button
          type="submit"
          // Disabled while the request is in flight: the cheapest way to stop
          // an impatient double-tap from creating the product twice.
          disabled={isSaving}
          className="rounded-lg bg-zinc-900 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {isSaving ? "Salvando…" : "Adicionar produto"}
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
