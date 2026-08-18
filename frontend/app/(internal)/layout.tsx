import Link from "next/link";
import { Newsreader } from "next/font/google";

import InternalNav from "./internal-nav";
import styles from "./layout.module.css";

const editorialFont = Newsreader({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
});

export default function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${styles.workspace} ${editorialFont.variable}`}>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <div className={styles.brandBlock}>
            <Link href="/painel" className={styles.brand}>
              In family
            </Link>
            <span>Administração</span>
          </div>

          <InternalNav />

          <div className={styles.ownerBlock}>
            <span>Gestão da loja</span>
            <p>Yasmin</p>
          </div>
        </aside>

        <div className={styles.contentPanel}>{children}</div>
      </div>
    </div>
  );
}
