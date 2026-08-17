"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  centsToApiString,
  formatCents,
  formatMoney,
  formatSaleDate,
  parseMoneyToCents,
  parseQuantityInput,
  toInputDecimal,
  todayInSaoPaulo,
} from "@/lib/format";
import type { PaymentMethod, Product, Sale } from "@/lib/types";

/**
 * One line of the sale being composed, held as strings because that is what an
 * `<input>` contains. Parsing happens once, on submit.
 *
 * `key` exists only for React: it identifies the row across re-renders. The
 * product id cannot serve that purpose, because the same product may appear on
 * two lines on purpose — two units at full price and one discounted, say. The
 * backend aggregates quantities per product before checking stock, so that is
 * safe.
 */
type SaleLine = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
};

// The domain codes the backend accepts, paired with the pt-BR text Yasmin sees.
// Kept in one object so a label and its code can never drift apart.
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  fiado: "Fiado",
};

const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS) as [
  PaymentMethod,
  string,
][];

/** Prefer the API's own message when we have one; otherwise say something useful. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const inputClassName =
  "w-full rounded-lg border border-zinc-300 bg-transparent px-4 py-3 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-500";
const labelClassName = "block text-sm text-zinc-500";

export default function VendasPage() {
  // --- Data from the API --------------------------------------------------
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [salesError, setSalesError] = useState("");

  // --- The sale being composed -------------------------------------------
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [productToAdd, setProductToAdd] = useState("");
  // Passing the function itself (not `todayInSaoPaulo()`) makes React call it
  // once, on the first render, instead of on every render.
  const [saleDate, setSaleDate] = useState(todayInSaoPaulo);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("dinheiro");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Every setState below happens after an await, never synchronously — see the
  // note in the estoque page: a synchronous setState in an effect body forces a
  // second render pass before the browser paints.
  const loadProducts = useCallback(async () => {
    try {
      const data = await api.get<Product[]>("/api/products");
      setProducts(data);
      setProductsError("");
    } catch (error) {
      setProductsError(
        messageFrom(error, "Não foi possível carregar os produtos."),
      );
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  const loadSales = useCallback(async () => {
    try {
      const data = await api.get<Sale[]>("/api/sales");
      setSales(data);
      setSalesError("");
    } catch (error) {
      setSalesError(messageFrom(error, "Não foi possível carregar as vendas."));
    } finally {
      setIsLoadingSales(false);
    }
  }, []);

  useEffect(() => {
    // An effect callback may not be `async` (React reads its return value as a
    // cleanup function), so the work goes in an immediately-invoked one.
    // `Promise.all` fires both requests at once rather than one after the other.
    (async () => {
      await Promise.all([loadProducts(), loadSales()]);
    })();
  }, [loadProducts, loadSales]);

  const productsById = new Map(products.map((product) => [product.id, product]));

  /**
   * A line's subtotal in cents, or `null` if the line isn't fully valid yet.
   *
   * Integer cents rather than floats — exact by construction. See the note in
   * lib/format.ts for why, and for the honest limits of that claim.
   */
  function lineSubtotalCents(line: SaleLine): number | null {
    const quantity = parseQuantityInput(line.quantity);
    const unitCents = parseMoneyToCents(line.unitPrice);

    if (quantity === null || quantity <= 0 || unitCents === null) return null;

    return unitCents * quantity;
  }

  /** The sale total, or `null` while any line is incomplete. */
  function totalCents(): number | null {
    let total = 0;
    for (const line of lines) {
      const subtotal = lineSubtotalCents(line);
      // Showing a total that silently skips a half-typed line would be worse
      // than showing none: it looks authoritative and is wrong.
      if (subtotal === null) return null;
      total += subtotal;
    }
    return total;
  }

  function handleAddLine() {
    const product = productsById.get(productToAdd);
    if (!product) return;

    setFormError("");
    setSuccessMessage("");
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        productId: product.id,
        quantity: "1",
        // Pre-filled with the listed price, shown the way she writes it
        // ("49,90"). She can overwrite it to give a discount on this line.
        unitPrice: toInputDecimal(product.sale_price),
      },
    ]);
    setProductToAdd("");
  }

  function updateLine(key: string, changes: Partial<SaleLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (lines.length === 0) {
      setFormError("Adicione pelo menos um produto à venda.");
      return;
    }

    // Validate and build the payload in one pass, bailing on the first problem
    // so the message can name the product it is about.
    const items = [];
    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product) {
        setFormError(
          "Um dos produtos não está mais disponível. Atualize a página.",
        );
        return;
      }

      const quantity = parseQuantityInput(line.quantity);
      if (quantity === null || quantity <= 0) {
        setFormError(`Informe uma quantidade válida para "${product.name}".`);
        return;
      }

      const unitCents = parseMoneyToCents(line.unitPrice);
      if (unitCents === null) {
        setFormError(
          `Informe um preço válido para "${product.name}". Exemplo: 49,90`,
        );
        return;
      }

      items.push({
        product_id: product.id,
        quantity,
        // Always sent, even when untouched. `unit_sale_price` is optional in the
        // API — omitting it makes the server use the product's current price —
        // but the form has already shown Yasmin a price and a total. Sending
        // what she saw is what guarantees the sale is recorded at the total on
        // screen, even if the product were re-priced while this page sat open.
        unit_sale_price: centsToApiString(unitCents),
      });
    }

    setIsSaving(true);
    try {
      const sale = await api.post<Sale>("/api/sales", {
        sale_date: saleDate,
        payment_method: paymentMethod,
        items,
      });

      setSuccessMessage(
        `Venda de ${formatMoney(sale.total_amount)} registrada com sucesso.`,
      );
      setLines([]);
      setSaleDate(todayInSaoPaulo());
      setPaymentMethod("dinheiro");

      // Both lists are now stale: the sale is new, and every product it touched
      // has less stock. Refetching both keeps the picker honest about what is
      // still available.
      await Promise.all([loadProducts(), loadSales()]);
    } catch (error) {
      // This is where the backend's 400 surfaces — including the insufficient
      // stock message, which already names the product and both quantities in
      // Portuguese and is shown to her verbatim.
      setFormError(messageFrom(error, "Não foi possível registrar a venda."));
    } finally {
      setIsSaving(false);
    }
  }

  const total = totalCents();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>

      {/* --- Record a sale ------------------------------------------------ */}
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label htmlFor="productToAdd" className={labelClassName}>
            Adicionar produto
          </label>
          <div className="mt-1 flex gap-3">
            {/* A native <select> is the right control on a phone: it opens the
                OS picker, which is far easier to hit than a custom dropdown. */}
            <select
              id="productToAdd"
              className={inputClassName}
              value={productToAdd}
              onChange={(event) => setProductToAdd(event.target.value)}
              disabled={isLoadingProducts || products.length === 0}
            >
              <option value="">
                {isLoadingProducts ? "Carregando…" : "Escolha um produto"}
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} — {formatMoney(product.sale_price)} (
                  {product.stock_quantity} em estoque)
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAddLine}
              disabled={productToAdd === ""}
              className="shrink-0 rounded-lg border border-zinc-300 px-5 py-3 text-base font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Adicionar
            </button>
          </div>

          {productsError && (
            <p className="mt-2 text-sm text-red-600">{productsError}</p>
          )}
          {!isLoadingProducts && !productsError && products.length === 0 && (
            <p className="mt-2 text-sm text-zinc-500">
              Nenhum produto cadastrado. Cadastre um produto no estoque primeiro.
            </p>
          )}
        </div>

        {/* --- The lines --------------------------------------------------- */}
        {lines.length > 0 && (
          <ul className="flex flex-col gap-3">
            {lines.map((line) => {
              const product = productsById.get(line.productId);
              const subtotal = lineSubtotalCents(line);
              const quantity = parseQuantityInput(line.quantity);
              // A hint only — the backend is the authority on stock, and it
              // re-checks under a row lock at the moment of sale.
              const exceedsStock =
                product !== undefined &&
                quantity !== null &&
                quantity > product.stock_quantity;

              return (
                <li
                  key={line.key}
                  className="rounded-lg border border-zinc-200 px-4 py-4 dark:border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="min-w-0 truncate font-medium">
                      {product?.name ?? "Produto indisponível"}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="shrink-0 rounded-lg px-3 py-1 text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      Remover
                    </button>
                  </div>

                  <div className="mt-3 flex gap-3">
                    <div className="flex-1">
                      <label
                        htmlFor={`quantity-${line.key}`}
                        className={labelClassName}
                      >
                        Quantidade
                      </label>
                      <input
                        id={`quantity-${line.key}`}
                        className={`mt-1 ${inputClassName}`}
                        type="text"
                        inputMode="numeric"
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(line.key, { quantity: event.target.value })
                        }
                      />
                    </div>

                    <div className="flex-1">
                      <label
                        htmlFor={`unitPrice-${line.key}`}
                        className={labelClassName}
                      >
                        Preço unitário
                      </label>
                      {/* text + inputMode, not type="number": a number input
                          silently discards a value typed with a comma, which is
                          exactly how a Brazilian writes prices. */}
                      <input
                        id={`unitPrice-${line.key}`}
                        className={`mt-1 ${inputClassName}`}
                        type="text"
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(event) =>
                          updateLine(line.key, { unitPrice: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-zinc-500">
                    Subtotal:{" "}
                    <span className="font-medium">
                      {subtotal === null ? "—" : formatCents(subtotal)}
                    </span>
                  </p>

                  {product && (
                    <p
                      className={`mt-1 text-sm ${
                        exceedsStock ? "text-red-600" : "text-zinc-500"
                      }`}
                    >
                      {product.stock_quantity} em estoque
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="flex items-baseline justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <span className="text-base">Total da venda</span>
            <span className="text-xl font-semibold">
              {total === null ? "—" : formatCents(total)}
            </span>
          </div>
        )}

        {/* --- Date and payment -------------------------------------------- */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="saleDate" className={labelClassName}>
              Data da venda
            </label>
            {/* type="date" gives the OS date picker on a phone and produces a
                "YYYY-MM-DD" value — exactly the format the API expects. */}
            <input
              id="saleDate"
              className={`mt-1 ${inputClassName}`}
              type="date"
              value={saleDate}
              onChange={(event) => setSaleDate(event.target.value)}
            />
          </div>

          <div className="flex-1">
            <label htmlFor="paymentMethod" className={labelClassName}>
              Forma de pagamento
            </label>
            <select
              id="paymentMethod"
              className={`mt-1 ${inputClassName}`}
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as PaymentMethod)
              }
            >
              {PAYMENT_METHOD_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          // Disabled while in flight: the cheapest way to stop an impatient
          // double-tap from recording the sale twice — which would deduct stock
          // twice, too.
          disabled={isSaving}
          className="rounded-lg bg-zinc-900 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isSaving ? "Registrando…" : "Registrar venda"}
        </button>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
        {successMessage && (
          <p className="text-sm text-green-700 dark:text-green-500">
            {successMessage}
          </p>
        )}
      </form>

      {/* --- Recent sales -------------------------------------------------- */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Vendas recentes</h2>

        <div className="mt-4">
          {isLoadingSales && <p className="text-sm text-zinc-500">Carregando…</p>}

          {!isLoadingSales && salesError && (
            <div>
              <p className="text-sm text-red-600">{salesError}</p>
              <button
                type="button"
                onClick={() => {
                  setIsLoadingSales(true);
                  void loadSales();
                }}
                className="mt-3 text-sm text-zinc-500 underline underline-offset-4"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!isLoadingSales && !salesError && sales.length === 0 && (
            <p className="text-sm text-zinc-500">
              Nenhuma venda registrada ainda.
            </p>
          )}

          {!isLoadingSales && !salesError && sales.length > 0 && (
            <ul className="flex flex-col gap-3">
              {sales.map((sale) => (
                <li
                  key={sale.id}
                  className="rounded-lg border border-zinc-200 px-4 py-4 dark:border-zinc-800"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-medium">
                      {formatSaleDate(sale.sale_date)}
                    </p>
                    <p className="font-medium">
                      {formatMoney(sale.total_amount)}
                    </p>
                  </div>

                  <p className="mt-1 text-sm text-zinc-500">
                    {PAYMENT_METHOD_LABELS[sale.payment_method]}
                  </p>

                  <ul className="mt-2 text-sm text-zinc-500">
                    {sale.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity} × {item.product_name} —{" "}
                        {formatMoney(item.unit_sale_price)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
