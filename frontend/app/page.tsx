import type { Metadata } from "next";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { Newsreader } from "next/font/google";

import styles from "./page.module.css";

const editorialFont = Newsreader({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});

const fallbackWhatsappNumber = "5511910781697";
const whatsappNumber = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? fallbackWhatsappNumber
).replace(/\D/g, "");
const whatsappMessage =
  "Olá! Vim pelo site da In family e gostaria de conhecer as peças.";
const whatsappHref = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
const instagramHref =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL ??
  "https://www.instagram.com/inf.amily/";
const heroImageSizes = "(max-width: 768px) 100vw, 94vw";
const {
  props: { srcSet: mobileHeroImageSrcSet },
} = getImageProps({
  src: "/images/infamily-family-hero-v2.png",
  alt: "",
  fill: true,
  sizes: heroImageSizes,
});

const values = [
  {
    number: "01",
    title: "Conforto que acompanha",
    description:
      "Peças gostosas de vestir, pensadas para a rotina e para os momentos especiais.",
  },
  {
    number: "02",
    title: "Estilo sem prazo",
    description:
      "Escolhas versáteis, femininas e fáceis de combinar com o que já faz parte de você.",
  },
  {
    number: "03",
    title: "Atendimento de perto",
    description:
      "Uma conversa simples e atenciosa para ajudar você a encontrar o que procura.",
  },
];

export const metadata: Metadata = {
  title: "In family | Moda feminina para a vida real",
  description:
    "Moda feminina com conforto, estilo e cuidado. Por família pra família. Fale com a In family pelo WhatsApp.",
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

export default function Home() {
  return (
    <div className={`${styles.page} ${editorialFont.variable}`}>
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
            <span>Conversar no WhatsApp</span>
            <ArrowIcon />
          </a>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroIntro}>
            <div className={styles.heroHeading}>
              <p className={styles.eyebrow}>Moda feminina para a vida real</p>
              <h1 id="hero-title" className={styles.heroTitle}>
                <span>por família</span>
                <em>pra família</em>
              </h1>
            </div>

            <div className={styles.heroContent}>
              <p>
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
                  className={styles.instagramButton}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Conheça a In family no Instagram"
                >
                  <InstagramIcon />
                  <span>Conheça a marca</span>
                </a>
              </div>
            </div>
          </div>

          <figure className={styles.heroPhoto}>
            <picture>
              <source
                media="(max-width: 600px)"
                srcSet={mobileHeroImageSrcSet}
                sizes={heroImageSizes}
              />
              <Image
                src="/images/infamily-family-hero.png"
                alt="Família reunida e sorrindo em uma varanda iluminada"
                fill
                loading="eager"
                fetchPriority="high"
                sizes={heroImageSizes}
                className={styles.heroImage}
              />
            </picture>
            <div className={styles.photoShade} aria-hidden="true" />
            <figcaption className={styles.photoCaption}>
              <span aria-hidden="true" />
              Feito para viver junto
            </figcaption>
          </figure>
        </section>

        <section className={styles.story} aria-labelledby="story-title">
          <div className={styles.storyInner}>
            <div className={styles.storyLead}>
              <p className={styles.sectionLabel}>Nosso jeito</p>
              <div>
                <h2 id="story-title">
                  Conforto, beleza e cuidado para acompanhar a vida como ela é.
                </h2>
                <p className={styles.storyCopy}>
                  Na In family, cada escolha nasce do desejo de vestir bem sem
                  deixar de lado o que importa: sentir-se à vontade, bonita e
                  pronta para aproveitar cada momento.
                </p>
              </div>
            </div>

            <div className={styles.valueGrid}>
              {values.map((value) => (
                <article className={styles.valueCard} key={value.number}>
                  <span className={styles.valueNumber}>{value.number}</span>
                  <h3>{value.title}</h3>
                  <p>{value.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.contact} aria-labelledby="contact-title">
          <div className={styles.contactCard}>
            <div className={styles.contactCopy}>
              <p className={styles.contactLabel}>Nosso catálogo</p>
              <h2 id="contact-title">Quer conhecer as novidades?</h2>
            </div>

            <div className={styles.contactAction}>
              <p>
                Conheça as peças, veja o que chegou e encontre seus próximos
                favoritos no catálogo da In family.
              </p>
              <Link href="/catalogo" className={styles.secondaryButton}>
                <span>Veja o catálogo</span>
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Link href="/" className={styles.footerBrand}>
            In family
          </Link>
          <p>Moda feminina, com carinho para a vida real.</p>
        </div>

        <div className={styles.footerBottom}>
          <span className={styles.footerCopyrightDesktop}>
            © {new Date().getFullYear()}
          </span>
          <span className={styles.footerCopyrightMobile}>
            © {new Date().getFullYear()} In family
          </span>
          <Link href="/login" className={styles.adminLink}>
            Acesso administrativo
          </Link>
        </div>
      </footer>
    </div>
  );
}
