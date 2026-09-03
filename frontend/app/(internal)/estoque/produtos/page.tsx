"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { compressImage } from "@/lib/image";
import { normalizeSearchValue } from "@/lib/search";
import type { Product } from "@/lib/types";

/** Prefer a useful API message over a generic network fallback. */
function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Which product's photo is being uploaded or removed right now — the same
  // shape as `deletingId` above, so a row can show its own busy state without
  // freezing the whole list.
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);

  // One hidden file input shared by every row, rather than one per product: a
  // list of eighty pieces would otherwise mount eighty file inputs. The row
  // that opened the picker is remembered here so the change handler knows
  // which product the chosen file belongs to.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingProductId = useRef<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const data = await api.get<Product[]>("/api/products");
      setProducts(data);
      setListError("");
    } catch (error) {
      setListError(messageFrom(error, "Não foi possível carregar os produtos."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Effects cannot be async themselves because React treats their return
    // value as a cleanup function.
    (async () => {
      await loadProducts();
    })();
  }, [loadProducts]);

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

  function openPhotoPicker(productId: string) {
    pendingProductId.current = productId;
    fileInputRef.current?.click();
  }

  async function handlePhotoSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    const productId = pendingProductId.current;
    // Reset immediately so picking the same file twice in a row still fires a
    // change event the second time.
    event.target.value = "";
    if (!file || !productId) return;

    setPhotoBusyId(productId);
    setListError("");

    try {
      const compressed = await compressImage(file);
      await api.upload(`/api/products/${productId}/photo`, compressed);
      // Reload rather than patching the row in place: the response carries a
      // brand-new photo URL (the path changes on every upload so caches cannot
      // serve the old picture), and re-reading keeps the list the single
      // source of truth.
      await loadProducts();
    } catch (error) {
      setListError(messageFrom(error, "Não foi possível enviar a foto."));
    } finally {
      setPhotoBusyId(null);
      pendingProductId.current = null;
    }
  }

  async function handleRemovePhoto(product: Product) {
    const confirmed = window.confirm(`Remover a foto de "${product.name}"?`);
    if (!confirmed) return;

    setPhotoBusyId(product.id);
    setListError("");

    try {
      await api.delete(`/api/products/${product.id}/photo`);
      await loadProducts();
    } catch (error) {
      setListError(messageFrom(error, "Não foi possível remover a foto."));
    } finally {
      setPhotoBusyId(null);
    }
  }

  const normalizedQuery = normalizeSearchValue(query);
  const visibleProducts = normalizedQuery
    ? products.filter((product) =>
        normalizeSearchValue(product.name).includes(normalizedQuery),
      )
    : products;

  const resultLabel = `${visibleProducts.length} ${
    visibleProducts.length === 1 ? "produto" : "produtos"
  }`;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--internal-olive)]">
            Estoque
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Produtos
          </h1>
        </div>

        <Link
          href="/estoque"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[var(--internal-ink)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--internal-olive-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--internal-olive)] min-[520px]:w-auto"
        >
          Adicionar produto
        </Link>
      </header>

      <div role="search" className="mt-7 sm:mt-8">
        <label htmlFor="productSearch" className="block text-sm text-zinc-500">
          Buscar produto por nome
        </label>
        <div className="relative mt-1">
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
          <input
            id="productSearch"
            type="search"
            autoComplete="off"
            placeholder="Digite o nome do produto"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-transparent py-3 pr-4 pl-12 text-base outline-none transition-colors placeholder:text-zinc-400 focus:border-[var(--internal-olive)]"
          />
        </div>
      </div>

      <section aria-labelledby="product-list-title" className="mt-7 sm:mt-8">
        <div className="mb-3 flex min-h-6 items-center justify-between gap-4">
          <h2 id="product-list-title" className="text-sm font-semibold">
            Todos os produtos
          </h2>
          {!isLoading && !listError && (
            <p aria-live="polite" className="text-sm text-zinc-500">
              {resultLabel}
            </p>
          )}
        </div>

        {isLoading && (
          <p className="text-sm text-zinc-500" aria-live="polite">
            Carregando…
          </p>
        )}

        {!isLoading && listError && (
          <div className="rounded-lg border border-red-200 bg-red-50/60 px-4 py-4">
            <p role="alert" className="text-sm text-red-700">
              {listError}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                void loadProducts();
              }}
              className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 underline underline-offset-4 transition-colors hover:bg-red-100"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!isLoading && !listError && products.length === 0 && (
          <div className="rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-4 py-6 text-center">
            <p className="text-sm text-zinc-500">
              Nenhum produto cadastrado ainda.
            </p>
          </div>
        )}

        {!isLoading &&
          !listError &&
          products.length > 0 &&
          visibleProducts.length === 0 && (
            <div className="rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-4 py-6 text-center">
              <p className="text-sm text-zinc-500">
                Nenhum produto encontrado para “{query.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-3 min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--internal-olive-dark)] underline underline-offset-4 transition-colors hover:bg-white"
              >
                Limpar busca
              </button>
            </div>
          )}

        {!isLoading && !listError && visibleProducts.length > 0 && (
          <ul className="flex flex-col gap-3">
            {visibleProducts.map((product) => (
              <li
                key={product.id}
                className="flex flex-col items-stretch gap-3 rounded-lg border border-zinc-200 px-4 py-4 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between min-[480px]:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {/* The thumbnail is a button: tapping it is how a photo gets
                      added or replaced. That keeps the row from growing an
                      extra control for something the picture itself already
                      represents. */}
                  <button
                    type="button"
                    onClick={() => openPhotoPicker(product.id)}
                    disabled={photoBusyId === product.id}
                    aria-label={
                      product.photo_url
                        ? `Trocar a foto de ${product.name}`
                        : `Adicionar foto a ${product.name}`
                    }
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] transition-colors hover:border-[var(--internal-olive)] disabled:opacity-50"
                  >
                    {product.photo_url ? (
                      // Plain <img> rather than next/image: these are already
                      // capped at 1600px and served from Supabase's CDN, so the
                      // optimizer would only add a build-time dependency on the
                      // Supabase hostname for no real gain. `loading="lazy"`
                      // means a long list only fetches what is on screen.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.photo_url}
                        alt={`Foto de ${product.name}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-zinc-400">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-6 w-6"
                        >
                          <path
                            d="M12 8v8m-4-4h8"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    )}

                    {photoBusyId === product.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-white/75 text-[11px] font-medium text-zinc-600">
                        Enviando…
                      </span>
                    )}
                  </button>

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
                    {product.photo_url && (
                      <button
                        type="button"
                        onClick={() => void handleRemovePhoto(product)}
                        disabled={photoBusyId === product.id}
                        className="mt-1 min-h-11 text-sm text-zinc-500 underline underline-offset-4 transition-colors hover:text-red-600 disabled:opacity-50"
                      >
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDelete(product)}
                  disabled={deletingId === product.id}
                  className="min-h-11 w-full shrink-0 rounded-lg px-4 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 min-[480px]:w-auto"
                >
                  {deletingId === product.id ? "Excluindo…" : "Excluir"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* One input for the whole list — `openPhotoPicker` records which row
          asked for it before clicking it. Hidden, because a bare file input
          cannot be styled to match anything around it. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handlePhotoSelected(event)}
      />
    </main>
  );
}
