"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";

import { formatMoney } from "@/lib/format";
import type { CatalogProduct } from "@/lib/types";

import styles from "./page.module.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const CATALOG_PLACEHOLDERS = [
  {
    id: "linen-dress",
    photoUrl: "/images/catalog-placeholders/linen-dress.jpg",
    alt: "Imagem ilustrativa de um vestido de linho bege",
  },
  {
    id: "clay-knit",
    photoUrl: "/images/catalog-placeholders/clay-knit.jpg",
    alt: "Imagem ilustrativa de uma blusa em tom de argila com calça clara",
  },
  {
    id: "olive-blouse",
    photoUrl: "/images/catalog-placeholders/olive-blouse.jpg",
    alt: "Imagem ilustrativa de uma blusa verde oliva com saia clara",
  },
] as const;

type CatalogSectionProps = {
  whatsappNumber: string;
};

type MarqueeItem<T> = {
  item: T;
  isRepeat: boolean;
  key: string;
};

const MIN_MARQUEE_ITEMS = 4;

function buildMarqueeItems<T extends { id: string }>(
  items: readonly T[],
): MarqueeItem<T>[] {
  if (items.length === 0) return [];

  return Array.from(
    { length: Math.max(MIN_MARQUEE_ITEMS, items.length) },
    (_, index) => {
      const item = items[index % items.length];
      return {
        item,
        isRepeat: index >= items.length,
        key: `${item.id}-${index}`,
      };
    },
  );
}

const PLACEHOLDER_MARQUEE_ITEMS = buildMarqueeItems(CATALOG_PLACEHOLDERS);

function ProductArrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 10h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function productWhatsappHref(number: string, productName: string): string {
  const message = `Olá! Vi ${productName} no catálogo da In family e gostaria de saber mais.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function PlaceholderMarqueeGroup({
  isDuplicate,
}: {
  isDuplicate: boolean;
}) {
  return (
    <ul
      className={styles.catalogMarqueeGroup}
      aria-hidden={isDuplicate || undefined}
      aria-label={isDuplicate ? undefined : "Prévia do catálogo"}
    >
      {PLACEHOLDER_MARQUEE_ITEMS.map(({ item, isRepeat, key }) => (
        <li
          className={`${styles.catalogCard} ${styles.catalogPlaceholderCard}`}
          aria-hidden={!isDuplicate && isRepeat ? true : undefined}
          key={key}
        >
          <div className={styles.catalogPhoto}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.photoUrl}
              alt={isDuplicate || isRepeat ? "" : item.alt}
              loading="lazy"
            />
            <span className={styles.catalogBadge}>Em breve</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProductMarqueeGroup({
  isDuplicate,
  items,
  whatsappNumber,
}: {
  isDuplicate: boolean;
  items: MarqueeItem<CatalogProduct>[];
  whatsappNumber: string;
}) {
  return (
    <ul
      className={styles.catalogMarqueeGroup}
      aria-hidden={isDuplicate || undefined}
      aria-label={isDuplicate ? undefined : "Produtos disponíveis"}
    >
      {items.map(({ item: product, isRepeat, key }) => {
        const isHidden = isDuplicate || isRepeat;

        return (
          <li
            className={styles.catalogCard}
            aria-hidden={!isDuplicate && isRepeat ? true : undefined}
            key={key}
          >
            <div className={styles.catalogPhoto}>
              {/* Product photos are already resized, stripped of metadata,
                  and served by Supabase's public CDN. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.photo_url}
                alt={isHidden ? "" : `Foto de ${product.name}`}
                loading="lazy"
              />
              <span className={styles.catalogBadge}>Disponível</span>
            </div>
            <div className={styles.catalogCardBody}>
              <h3>{product.name}</h3>
              <p>{formatMoney(product.sale_price)}</p>
              <a
                href={productWhatsappHref(whatsappNumber, product.name)}
                target="_blank"
                rel="noreferrer"
                tabIndex={isHidden ? -1 : undefined}
                aria-label={
                  isHidden
                    ? undefined
                    : `Perguntar sobre ${product.name} pelo WhatsApp`
                }
              >
                <span>Quero esta peça</span>
                <ProductArrow />
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CatalogSection({ whatsappNumber }: CatalogSectionProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const productMarqueeItems = buildMarqueeItems(products);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);

    if (!API_BASE_URL) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/catalog`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Catalogue request failed");

      const data = (await response.json()) as CatalogProduct[];
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadCatalog();
    })();
  }, [loadCatalog]);

  return (
    <section className={styles.catalog} aria-labelledby="catalog-title">
      <div className={styles.catalogInner}>
        <header>
          <div className={styles.catalogHeading}>
            <p className={styles.sectionLabel}>Peças selecionadas</p>
            <h2 id="catalog-title">Veja o catálogo</h2>
          </div>
        </header>

        {isLoading && (
          <div
            className={styles.catalogGrid}
            aria-label="Carregando catálogo"
            aria-busy="true"
          >
            {[0, 1, 2].map((item) => (
              <div
                className={`${styles.catalogCard} ${styles.catalogSkeleton}`}
                key={item}
              >
                <div className={styles.catalogPhoto} />
                <div className={styles.catalogCardBody}>
                  <span className={styles.skeletonLine} />
                  <span
                    className={`${styles.skeletonLine} ${styles.skeletonLineShort}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && products.length === 0 && (
          <div
            className={styles.catalogMarquee}
            style={
              {
                "--catalog-duration": `${PLACEHOLDER_MARQUEE_ITEMS.length * 7}s`,
              } as CSSProperties
            }
          >
            <div className={styles.catalogMarqueeTrack}>
              <PlaceholderMarqueeGroup isDuplicate />
              <PlaceholderMarqueeGroup isDuplicate={false} />
            </div>
          </div>
        )}

        {!isLoading && products.length > 0 && (
          <div
            className={styles.catalogMarquee}
            style={
              {
                "--catalog-duration": `${productMarqueeItems.length * 7}s`,
              } as CSSProperties
            }
          >
            <div className={styles.catalogMarqueeTrack}>
              <ProductMarqueeGroup
                isDuplicate
                items={productMarqueeItems}
                whatsappNumber={whatsappNumber}
              />
              <ProductMarqueeGroup
                isDuplicate={false}
                items={productMarqueeItems}
                whatsappNumber={whatsappNumber}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
