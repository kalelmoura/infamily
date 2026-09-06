import type { Metadata } from "next";
import Link from "next/link";
import { Source_Serif_4 } from "next/font/google";

import { CatalogSection } from "./catalog-section";
import styles from "./page.module.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

const whatsappNumber = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? ""
).replace(/\D/g, "");

if (!whatsappNumber) {
  throw new Error("NEXT_PUBLIC_WHATSAPP_NUMBER is not set");
}

const whatsappMessage =
  "Olá! Vim pelo site da In family e gostaria de conhecer as peças.";
const whatsappHref = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
const instagramHref =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL ??
  "https://www.instagram.com/inf.amily/";
const storeAddress = process.env.STORE_ADDRESS?.trim();

if (!storeAddress) {
  throw new Error("STORE_ADDRESS is not set");
}

const encodedStoreAddress = encodeURIComponent(storeAddress);
const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodedStoreAddress}`;
const mapEmbedHref = `https://www.google.com/maps?q=${encodedStoreAddress}&output=embed`;
export const metadata: Metadata = {
  title: "In family | Moda feminina para a vida real",
  description:
    "Conheça o catálogo da In family: moda feminina com conforto, estilo e cuidado. Por família pra família.",
};

function WhatsappIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20.5 11.6a8.5 8.5 0 0 1-12.55 7.48L3.5 20.5l1.45-4.3A8.5 8.5 0 1 1 20.5 11.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 7.8c.18-.4.37-.4.68-.4h.58c.18 0 .32.06.42.3l.76 1.78c.08.2.05.36-.08.53l-.58.72c-.13.16-.1.32-.02.46.43.76 1.05 1.4 1.8 1.85.16.1.32.12.47-.04l.77-.9c.15-.17.32-.2.53-.12l1.84.87c.2.1.3.24.28.45-.05.66-.32 1.25-.78 1.7-.48.47-1.2.7-1.88.54-1.13-.27-2.6-.9-4.03-2.3-1.16-1.13-1.9-2.45-2.2-3.5-.25-.87.05-1.48.43-2.03Z"
        fill="currentColor"
      />
    </svg>
  );
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

function RightArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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

function InstagramIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="17.5" cy="6.7" r="1.1" fill="currentColor" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 21s6-5.16 6-11a6 6 0 1 0-12 0c0 5.84 6 11 6 11Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className={`${styles.page} ${sourceSerif.variable}`}>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="Página inicial da In family"
          >
            In family
          </Link>

          <a
            href={whatsappHref}
            className={styles.headerContact}
            target="_blank"
            rel="noreferrer"
            aria-label="Conversar com a In family pelo WhatsApp"
          >
            <span>Fale conosco</span>
            <RightArrowIcon />
          </a>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title" className={styles.heroTitle}>
              <span>por família</span>
              <em>pra família</em>
            </h1>
            <p className={styles.heroDescription}>
              Peças escolhidas com carinho para acompanhar mulheres e suas
              famílias nos dias comuns, nos encontros e em tudo que acontece
              no meio.
            </p>
            <div className={styles.heroActions}>
              <a
                href={whatsappHref}
                className={styles.primaryButton}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsappIcon />
                <span>Falar no WhatsApp</span>
              </a>
              <a
                href={instagramHref}
                className={styles.secondaryButton}
                target="_blank"
                rel="noreferrer"
                aria-label="Conheça a In family no Instagram"
              >
                <InstagramIcon />
                <span>Ver o Instagram</span>
              </a>
            </div>
          </div>
        </section>

        <CatalogSection whatsappNumber={whatsappNumber} />

        <section className={styles.location} aria-labelledby="location-title">
          <div className={styles.locationInner}>
            <div className={styles.locationCopy}>
              <p className={styles.sectionLabel}>Visite a loja</p>
              <h2 id="location-title">Ficamos perto de você</h2>
            </div>

            <div className={styles.mapArea}>
              <div className={styles.locationMeta}>
                <div className={styles.addressRow}>
                  <span className={styles.pin}>
                    <PinIcon />
                  </span>
                  <address>{storeAddress}</address>
                </div>
                <a
                  href={mapHref}
                  className={styles.mapLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Abrir no mapa</span>
                  <ArrowIcon />
                </a>
              </div>
              <div className={styles.mapFrame}>
                <iframe
                  src={mapEmbedHref}
                  title={`Mapa da In family em ${storeAddress}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} In family</span>
          <Link href="/login" className={styles.adminLink}>
            Acesso administrativo
          </Link>
        </div>
      </footer>
    </div>
  );
}
