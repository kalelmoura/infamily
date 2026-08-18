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
import type {
  Client,
  FiadoFrequency,
  PaymentMethod,
  Product,
  Sale,
} from "@/lib/types";

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

// Same idea for the fiado frequency codes the backend accepts.
const FREQUENCY_LABELS: Record<FiadoFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABELS) as [
  FiadoFrequency,
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

  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [clientsError, setClientsError] = useState("");

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
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // --- Inline client registration ----------------------------------------
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientFirstName, setNewClientFirstName] = useState("");
  const [newClientLastName, setNewClientLastName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientSocial, setNewClientSocial] = useState("");
  const [newClientError, setNewClientError] = useState("");
  const [isSavingClient, setIsSavingClient] = useState(false);

  // --- The fiado terms, used only when the payment method is "fiado" -------
  // Kept as ordinary state next to the rest of the form rather than in a
  // separate component: this is the spec's unified model showing through, one
  // form recording one event, with four extra fields when the sale is on
  // credit. They stay in state while another method is selected — switching to
  // Pix and back does not make her re-enter the payment agreement.
  const [fiadoFrequency, setFiadoFrequency] = useState<FiadoFrequency>("monthly");
  const [fiadoInstallments, setFiadoInstallments] = useState("1");
  const [fiadoAgreedDate, setFiadoAgreedDate] = useState("");

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

  const loadClients = useCallback(async () => {
    try {
      const data = await api.get<Client[]>("/api/clients");
      setClients(data);
      setSelectedClientId((current) => {
        if (data.some((client) => client.id === current)) return current;
        return data.find((client) => client.is_walk_in)?.id ?? "";
      });
      setClientsError("");
    } catch (error) {
      setClientsError(
        messageFrom(error, "Não foi possível carregar os clientes."),
      );
    } finally {
      setIsLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    // An effect callback may not be `async` (React reads its return value as a
    // cleanup function), so the work goes in an immediately-invoked one.
    // `Promise.all` fires both requests at once rather than one after the other.
    (async () => {
      await Promise.all([loadProducts(), loadSales(), loadClients()]);
    })();
  }, [loadClients, loadProducts, loadSales]);

  const productsById = new Map(products.map((product) => [product.id, product]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const walkInClient = clients.find((client) => client.is_walk_in) ?? null;
  const selectedClient = clientsById.get(selectedClientId) ?? null;
  const clientSelectValue =
    paymentMethod === "fiado" && selectedClient?.is_walk_in
      ? ""
      : selectedClientId;
  const normalizedClientSearch = clientSearch.trim().toLocaleLowerCase("pt-BR");
  const filteredClients = clients.filter((client) => {
    if (!normalizedClientSearch) return true;
    return `${client.full_name} ${client.phone}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedClientSearch);
  });
  const clientOptions =
    selectedClient !== null &&
    !filteredClients.some((client) => client.id === selectedClient.id)
      ? [selectedClient, ...filteredClients]
      : filteredClients;

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

  function handlePaymentMethodChange(nextMethod: PaymentMethod) {
    setPaymentMethod(nextMethod);
    setFormError("");

    if (nextMethod === "fiado" && selectedClient?.is_walk_in) {
      setSelectedClientId("");
      return;
    }

    if (nextMethod !== "fiado" && !selectedClientId && walkInClient) {
      setSelectedClientId(walkInClient.id);
    }
  }

  async function handleCreateClient() {
    setNewClientError("");

    const firstName = newClientFirstName.trim();
    const lastName = newClientLastName.trim();
    const phone = newClientPhone.trim();

    if (!firstName || !lastName || !phone) {
      setNewClientError("Informe nome, sobrenome e telefone.");
      return;
    }

    setIsSavingClient(true);
    try {
      const client = await api.post<Client>("/api/clients", {
        first_name: firstName,
        last_name: lastName,
        phone,
        social_handle: newClientSocial.trim() || null,
      });

      await loadClients();
      setSelectedClientId(client.id);
      setClientSearch("");
      setNewClientFirstName("");
      setNewClientLastName("");
      setNewClientPhone("");
      setNewClientSocial("");
      setIsAddingClient(false);
    } catch (error) {
      setNewClientError(
        messageFrom(error, "Não foi possível adicionar o cliente."),
      );
    } finally {
      setIsSavingClient(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (lines.length === 0) {
      setFormError("Adicione pelo menos um produto à venda.");
      return;
    }

    if (selectedClient === null) {
      setFormError("Selecione um cliente para a venda.");
      return;
    }

    if (paymentMethod === "fiado" && selectedClient.is_walk_in) {
      setFormError(
        "Uma venda no fiado precisa de um cliente cadastrado.",
      );
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

    // The fiado terms, validated only when they apply. The backend rejects
    // terms sent with any other payment method (and a fiado sale sent without
    // them), so this block and the `payment_method` field have to agree.
    let fiado: Record<string, unknown> | undefined;
    if (paymentMethod === "fiado") {
      const installments = parseQuantityInput(fiadoInstallments);
      if (installments === null || installments <= 0) {
        setFormError("Informe o número de parcelas (mínimo 1).");
        return;
      }

      if (!fiadoAgreedDate) {
        setFormError("Informe a data combinada para o pagamento.");
        return;
      }
      if (fiadoAgreedDate < saleDate) {
        // Both are "YYYY-MM-DD", so a plain string comparison is a date
        // comparison — the format sorts chronologically by construction.
        setFormError(
          "A data combinada não pode ser anterior à data da venda.",
        );
        return;
      }

      fiado = {
        frequency: fiadoFrequency,
        installments_count: installments,
        agreed_settlement_date: fiadoAgreedDate,
      };
    }

    setIsSaving(true);
    try {
      const sale = await api.post<Sale>("/api/sales", {
        client_id: selectedClient.id,
        sale_date: saleDate,
        payment_method: paymentMethod,
        items,
        // Spread so the key is absent (not `null`) for an immediate sale: the
        // schema forbids fiado terms on any other payment method.
        ...(fiado === undefined ? {} : { fiado }),
      });

      setSuccessMessage(
        paymentMethod === "fiado"
          ? `Fiado de ${formatMoney(sale.total_amount)} registrado para ${selectedClient.full_name}.`
          : `Venda de ${formatMoney(sale.total_amount)} registrada com sucesso.`,
      );
      setLines([]);
      setSaleDate(todayInSaoPaulo());
      setPaymentMethod("dinheiro");
      setSelectedClientId(walkInClient?.id ?? "");
      setClientSearch("");
      setFiadoFrequency("monthly");
      setFiadoInstallments("1");
      setFiadoAgreedDate("");

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

  /**
   * What the installments will look like, or `null` while the numbers needed to
   * say aren't there yet.
   *
   * This mirrors the backend's rule rather than guessing at it: the per-
   * installment amount is the total divided by the count and rounded **up** to
   * the cent, and the last installment absorbs what is left over. Because the
   * total is already held in integer cents, `Math.ceil` on cents is exactly the
   * `ROUND_CEILING` quantize the server does on a two-decimal Decimal — the two
   * agree to the cent, not approximately.
   *
   * It is a preview, not the source of truth: the value stored is the one the
   * server computes from the total it derives from real stock.
   */
  function installmentPreviewFor(
    totalInCents: number | null,
  ): { count: number; amountCents: number; lastAmountCents: number } | null {
    const count = parseQuantityInput(fiadoInstallments);
    if (totalInCents === null || totalInCents <= 0) return null;
    if (count === null || count <= 0) return null;

    const amountCents = Math.ceil(totalInCents / count);
    // Rounding up means the earlier installments slightly overshoot, so the
    // last one is the smaller remainder — and never negative, in the degenerate
    // case where the rounding covers the whole total before the last payment.
    const lastAmountCents = Math.max(totalInCents - amountCents * (count - 1), 0);

    return { count, amountCents, lastAmountCents };
  }

  const installmentPreview =
    paymentMethod === "fiado" ? installmentPreviewFor(total) : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>

      {/* --- Record a sale ------------------------------------------------ */}
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <section className="rounded-xl border border-[#e3d7cc] bg-[#f8f2e9] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-[#342a24]">Cliente da venda</p>
              <p className="mt-1 text-sm text-[#75675e]">
                Vendas comuns começam como Cliente avulso.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAddingClient((current) => !current);
                setNewClientError("");
              }}
              className="shrink-0 rounded-lg border border-[#cbb7a8] bg-[#fffdf9] px-3 py-2 text-sm font-medium text-[#8f5745] transition-colors hover:bg-white"
            >
              {isAddingClient ? "Cancelar" : "+ Novo cliente"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="clientSearch" className={labelClassName}>
                Buscar cliente
              </label>
              <input
                id="clientSearch"
                className={`mt-1 ${inputClassName} bg-[#fffdf9]`}
                type="search"
                placeholder="Nome ou telefone"
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="clientId" className={labelClassName}>
                Selecionar cliente
              </label>
              <select
                id="clientId"
                className={`mt-1 ${inputClassName} bg-[#fffdf9]`}
                value={clientSelectValue}
                onChange={(event) => setSelectedClientId(event.target.value)}
                disabled={isLoadingClients}
              >
                <option value="">
                  {isLoadingClients ? "Carregando…" : "Escolha um cliente"}
                </option>
                {clientOptions.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                    disabled={paymentMethod === "fiado" && client.is_walk_in}
                  >
                    {client.full_name} — {client.phone}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {paymentMethod === "fiado" && (
            <p className="mt-3 text-sm text-[#8f5745]">
              Para fiado, selecione um cliente cadastrado.
            </p>
          )}

          {clientsError && (
            <p className="mt-3 text-sm text-red-600">{clientsError}</p>
          )}

          {!isLoadingClients &&
            !clientsError &&
            clientOptions.length === 0 && (
              <p className="mt-3 text-sm text-[#75675e]">
                Nenhum cliente encontrado para esta busca.
              </p>
            )}

          {isAddingClient && (
            <div className="mt-4 border-t border-[#dfd1c4] pt-4">
              <p className="text-sm font-medium text-[#342a24]">
                Adicionar sem sair da venda
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="newClientFirstName" className={labelClassName}>
                    Nome
                  </label>
                  <input
                    id="newClientFirstName"
                    className={`mt-1 ${inputClassName} bg-[#fffdf9]`}
                    type="text"
                    value={newClientFirstName}
                    onChange={(event) =>
                      setNewClientFirstName(event.target.value)
                    }
                  />
                </div>
                <div>
                  <label htmlFor="newClientLastName" className={labelClassName}>
                    Sobrenome
                  </label>
                  <input
                    id="newClientLastName"
                    className={`mt-1 ${inputClassName} bg-[#fffdf9]`}
                    type="text"
                    value={newClientLastName}
                    onChange={(event) =>
                      setNewClientLastName(event.target.value)
                    }
                  />
                </div>
                <div>
                  <label htmlFor="newClientPhone" className={labelClassName}>
                    Telefone
                  </label>
                  <input
                    id="newClientPhone"
                    className={`mt-1 ${inputClassName} bg-[#fffdf9]`}
                    type="tel"
                    value={newClientPhone}
                    onChange={(event) => setNewClientPhone(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="newClientSocial" className={labelClassName}>
                    Instagram ou Facebook (opcional)
                  </label>
                  <input
                    id="newClientSocial"
                    className={`mt-1 ${inputClassName} bg-[#fffdf9]`}
                    type="text"
                    placeholder="@usuario"
                    value={newClientSocial}
                    onChange={(event) => setNewClientSocial(event.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleCreateClient()}
                disabled={isSavingClient}
                className="mt-3 w-full rounded-lg bg-[#a96753] px-4 py-3 font-medium text-white transition-colors hover:bg-[#8f5745] disabled:opacity-50"
              >
                {isSavingClient ? "Adicionando…" : "Adicionar e selecionar"}
              </button>

              {newClientError && (
                <p className="mt-3 text-sm text-red-600">{newClientError}</p>
              )}
            </div>
          )}
        </section>

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
                handlePaymentMethodChange(event.target.value as PaymentMethod)
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

        {/* --- Fiado terms, only when the sale is on credit ---------------- */}
        {paymentMethod === "fiado" && (
          <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 px-4 py-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">
              Dados do fiado
            </p>

            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="fiadoFrequency" className={labelClassName}>
                  Frequência
                </label>
                <select
                  id="fiadoFrequency"
                  className={`mt-1 ${inputClassName}`}
                  value={fiadoFrequency}
                  onChange={(event) =>
                    setFiadoFrequency(event.target.value as FiadoFrequency)
                  }
                >
                  {FREQUENCY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label htmlFor="fiadoInstallments" className={labelClassName}>
                  Número de parcelas
                </label>
                <input
                  id="fiadoInstallments"
                  className={`mt-1 ${inputClassName}`}
                  type="text"
                  inputMode="numeric"
                  value={fiadoInstallments}
                  onChange={(event) =>
                    setFiadoInstallments(event.target.value)
                  }
                />
              </div>
            </div>

            <div>
              <label htmlFor="fiadoAgreedDate" className={labelClassName}>
                Data combinada
              </label>
              {/* Left blank on purpose rather than defaulted to today: the date
                  the customer promised is the one fact this screen cannot
                  guess, and a pre-filled one is easy to accept by accident. */}
              <input
                id="fiadoAgreedDate"
                className={`mt-1 ${inputClassName}`}
                type="date"
                value={fiadoAgreedDate}
                onChange={(event) => setFiadoAgreedDate(event.target.value)}
              />
            </div>

            {installmentPreview !== null && (
              <p className="text-sm text-zinc-500">
                {installmentPreview.count}× de{" "}
                <span className="font-medium">
                  {formatCents(installmentPreview.amountCents)}
                </span>
                {installmentPreview.lastAmountCents !==
                  installmentPreview.amountCents && (
                  <>
                    {" "}
                    (última parcela de{" "}
                    {formatCents(installmentPreview.lastAmountCents)})
                  </>
                )}
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          // Disabled while in flight: the cheapest way to stop an impatient
          // double-tap from recording the sale twice — which would deduct stock
          // twice, too.
          disabled={isSaving}
          className="rounded-lg bg-zinc-900 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isSaving
            ? "Registrando…"
            : paymentMethod === "fiado"
              ? "Registrar fiado"
              : "Registrar venda"}
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
                    {sale.client_name} · {PAYMENT_METHOD_LABELS[sale.payment_method]}
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
