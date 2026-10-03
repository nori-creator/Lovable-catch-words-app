import { Link } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";

/**
 * 特定商取引法の表記・利用規約・プライバシーへの道（料金の画面・設定の Pro の欄・
 * 法務の文書の下）。押せる高さを保つため、行の中でも上下に余白を取る。
 */
export function LegalLinks() {
  const t = useT();
  return (
    <>
      <Link to="/legal/commerce" className="inline-block py-3 -my-3 underline">
        {t("legal.commerceLink")}
      </Link>
      <Link to="/terms" className="inline-block py-3 -my-3 underline">
        {t("auth.terms")}
      </Link>
      <Link to="/privacy" className="inline-block py-3 -my-3 underline">
        {t("auth.privacy")}
      </Link>
    </>
  );
}
