"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
// Money parsing and formatting moved to lib/format.ts once the vendas page
// needed the same rules — two copies of money handling would eventually drift.
import { formatMoney, parseMoneyInput, parseQuantityInput } from "@/lib/format";
import type { Product } from "@/lib/types";

/** Prefer the API's own message when we have one; otherwise say something useful. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

// Repeated Tailwind strings, named once so the JSX below stays readable and
// every field keeps the same generous touch target.
const inputClassName =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-4 py-3 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500";
const labelClassName = "block text-sm text-zinc-500";

export default function EstoquePage() {
  // --- The list -----------------------------------------------------------
  const [products, setProducts] = useState<Product[]>([]);
  // Starts true: the first fetch is already on its way when the page paints,
  // so the user never sees an "empty stock" flash that isn't true.
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState("");

  // --- The "add product" form --------------------------------------------
  // Controlled inputs, all stored as strings — that is what an <input> holds.
  // Parsing happens once, on submit.
  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Which row is currently being deleted, so only that button shows "Excluindo…".
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // `useCallback` keeps this function identity stable across renders, which
  // matters because the effect below lists it as a dependency: without it, a
  // new function every render would re-run the effect every render.
  //
  // Every setState here happens *after* the await, never synchronously. That
  // is what makes it safe to call straight from an effect: a synchronous
  // setState in an effect body triggers a second render pass before the
  // browser paints (React's `set-state-in-effect` rule flags exactly this).
  // Callers that want the spinner back flip `isLoading` themselves, from an
  // event handler, where synchronous updates are the normal thing to do.
  const loadProducts = useCallback(async () => {
    try {
      const data = await api.get<Product[]>("/api/products");
      setProducts(data);
      setListError("");
    } catch (error) {
      setListError(messageFrom(error, "Não foi possível carregar o estoque."));
    } finally {
      // `finally` runs on both paths, so the spinner can never get stuck on.
      setIsLoading(false);
    }
  }, []);

  // Runs once after the first render. An effect (not a call in the render
  // body) because fetching is a side effect: rendering must stay pure.
  useEffect(() => {
    // The effect callback itself may not be `async` — React reads its return
    // value as a cleanup function, and an async function returns a promise.
    // Wrapping the work in an immediately-invoked async function is the usual
    // way around that.
    (async () => {
      await loadProducts();
    })();
  }, [loadProducts]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Stop the browser's native submit, which would reload the whole page.
    event.preventDefault();
    setFormError("");

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

      // Re-fetch instead of pushing the created product into local state: the
      // list is sorted by name in SQL, and the server is the one that knows
      // where the new item belongs. One extra request buys correctness.
      await loadProducts();
    } catch (error) {
      setFormError(messageFrom(error, "Não foi possível salvar o produto."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(
      `Excluir "${product.name}" do estoque?\n\nEsta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setDeletingId(product.id);
    setListError("");

    try {
      await api.delete(`/api/products/${product.id}`);
      await loadProducts();
    } catch (error) {
      setListError(messageFrom(error, "Não foi possível excluir o produto."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>

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
          className="rounded-lg bg-zinc-900 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isSaving ? "Salvando…" : "Adicionar produto"}
        </button>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </form>

      {/* --- The list ----------------------------------------------------- */}
      <div className="mt-10 sm:mt-12">
        {isLoading && <p className="text-sm text-zinc-500">Carregando…</p>}

        {!isLoading && listError && (
          <div>
            <p className="text-sm text-red-600">{listError}</p>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                void loadProducts();
              }}
              className="mt-3 text-sm text-zinc-500 underline underline-offset-4"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!isLoading && !listError && products.length === 0 && (
          <p className="text-sm text-zinc-500">
            Nenhum produto cadastrado ainda.
          </p>
        )}

        {!isLoading && !listError && products.length > 0 && (
          <ul className="flex flex-col gap-3">
            {products.map((product) => (
              // `key` must be a stable id, never the array index: React uses it
              // to match rows across re-renders, and indexes shift on delete.
              <li
                key={product.id}
                className="flex flex-col items-stretch gap-3 rounded-lg border border-zinc-200 px-4 py-4 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between min-[480px]:gap-4 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{product.name}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Custo {formatMoney(product.cost_price)} · Venda{" "}
                    {formatMoney(product.sale_price)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {product.stock_quantity}{" "}
                    {product.stock_quantity === 1 ? "unidade" : "unidades"} ·{" "}
                    {product.sold_quantity}{" "}
                    {product.sold_quantity === 1 ? "vendido" : "vendidos"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDelete(product)}
                  disabled={deletingId === product.id}
                  className="w-full shrink-0 rounded-lg px-4 py-3 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 min-[480px]:w-auto dark:hover:bg-red-950"
                >
                  {deletingId === product.id ? "Excluindo…" : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
