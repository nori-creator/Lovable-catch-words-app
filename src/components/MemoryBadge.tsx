import { useT } from "@/lib/i18n";
import type { MemoryBadgeInfo } from "@/lib/memory-badge";

/**
 * 画像の右上の**記憶の印**（段の色 + %）。
 *
 * 色は段ごとのトークン（`mem-lv-N mem-chip`）で持つ — 暗いテーマでも
 * 読める濃さが styles.css 側で測ってある。**写真の上に乗る**ので、
 * 半透明のまま置くと明るい写真で字が沈む。地は不透明に近くし、
 * 影で写真から浮かせる。
 */
export function MemoryBadge({
  info,
  className = "",
}: {
  info: MemoryBadgeInfo;
  className?: string;
}) {
  const t = useT();
  const label = t(info.level.labelKey);
  return (
    <span
      className={`memory-badge inline-flex min-w-0 items-center gap-1 overflow-hidden rounded-full px-1.5 py-0.5 text-caption font-semibold leading-none shadow ${info.level.chip} ${className}`}
      aria-label={t("memory.badgeAria", { label, n: info.strength })}
    >
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${info.level.bar}`} />
      {/* **色と数だけ**（オーナー指示 2026-09-22「画像の右上の記憶の状態は
          その色と数字だけでいい」）。段の名前は読み上げ（`aria-label`）に
          だけ残す — 画面では色が段を、数が強さを言う。 */}
      <span aria-hidden="true" className="shrink-0 tabular-nums">
        {info.strength}%
      </span>
    </span>
  );
}
