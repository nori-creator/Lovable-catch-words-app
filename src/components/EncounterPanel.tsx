import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { EncounterEstimate } from "@/lib/encounter.functions";
import type { RarityConfidence } from "@/lib/rarity";

/**
 * 「今週この言葉に出会う見込み」と、そのレア度。
 *
 * 要望(2026-08-18):
 * 「ユーザーがその単語に出会う確率を数学的に表示して。(単語のレア度を
 *  数学的に正確に表示したい。)」「〇〇限定、とか場所のラベルを表示したい。
 *  (台南限定、台湾限定、ポケモンの〇〇地方のポケモンみたいな)」
 *
 * ## 数字だけを出さない
 * ここに出る %は**言い切り**なので、何を根拠にした数字かを必ず添える。
 * このアプリが最初に決めた「検証済みとAI生成を区別する」がそのまま効く所で、
 * 推定を実測の顔で出すのはその原則を破ることになる。
 *
 * ## 人数を裸で出さない
 * 「4人中3人が撮った」はほとんど個人を指す。人数は `observed_users` が
 * 入っているときだけ出し、server 側はそれを「実測」と名乗れる規模まで
 * null にしてある(`encounter.functions.ts`)。
 *
 * 通信も状態も持たない。検査の雛形から本物の見た目をそのまま撮れる。
 */
export function EncounterPanel({ data }: { data: EncounterEstimate }) {
  const t = useT();
  const pct = Math.round(data.probability * 100);
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body">{t("enc.thisWeek")}</span>
        <span className="text-title font-semibold tabular-nums">{pct}%</span>
      </div>

      <Stars n={data.stars} />

      {/* どこで出会うか。**部屋の名前は図鑑と同じ言葉**を使う —
          同じ物を別の名前で呼ぶと、別の分類だと読まれる。 */}
      {data.top_rooms.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground">{t("enc.where")}</span>
          {data.top_rooms.map((room) => (
            <span
              key={room}
              className="rounded-full bg-secondary px-2 py-0.5 text-caption font-medium ring-1 ring-border"
            >
              {t(`room.${room}`)}
            </span>
          ))}
        </div>
      )}

      {/* 「台南限定」「5〜8月」。ポケモンの地方限定と同じ手触りを狙う所。 */}
      {(data.region_scope || data.season_months.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {data.region_scope && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary-ink">
              <Sparkles className="h-3 w-3" />
              {t("enc.onlyIn", { place: data.region_scope })}
            </span>
          )}
          {data.season_months.length > 0 && (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-caption font-semibold text-warn-ink">
              {t("enc.season", { months: monthRange(data.season_months) })}
            </span>
          )}
        </div>
      )}

      {/* **出所。数字と同じ画面に必ず居させる。** */}
      <p className="text-caption text-muted-foreground">{sourceLine(data, t)}</p>
    </div>
  );
}

/** ★は塗りと空きの数で読ませる。**数字も添える** — 色と形だけに頼らない。 */
function Stars({ n }: { n: number }) {
  const t = useT();
  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={t("enc.rarityAria", { n: String(n) })}
    >
      <span className="text-body tracking-[0.1em] text-warn-ink">
        {"★".repeat(n)}
        <span className="text-muted-foreground">{"☆".repeat(5 - n)}</span>
      </span>
      <span className="text-caption text-muted-foreground">{t(`enc.rarity${n}`)}</span>
    </div>
  );
}

/**
 * 何を根拠にした数字かを1行で。
 * **人数が入っているときだけ人数を言う** — server がそこを守っている。
 */
function sourceLine(
  data: { confidence: RarityConfidence; observed_users: number | null },
  t: (k: string, v?: Record<string, string>) => string,
): string {
  if (data.confidence === "measured" && data.observed_users != null) {
    return t("enc.srcMeasuredN", { n: String(data.observed_users) });
  }
  if (data.confidence === "measured") return t("enc.srcMeasured");
  if (data.confidence === "blended") return t("enc.srcBlended");
  return t("enc.srcEstimate");
}

/**
 * 旬の月を「5〜8月」の形に。飛んでいる月は「・」で並べる。
 *
 * **「月」は区間ごとに付ける。** まとめて末尾に1つだけ付けると
 * 「1〜2・12月」となり、**「1〜2ヶ月と12月」と読めてしまう**
 * (検査の絵で気づいた)。「1〜2月・12月」なら誤読しようがない。
 *
 * **繋がっているかどうかを勝手に決めない** — 12月と1月をまたぐ旬もあるが、
 * それを1つの区間に畳むと「12〜1月」と書くことになり、
 * 間の月まで旬だと言ったことになる。並べたまま出す。
 */
export function monthRange(months: readonly number[]): string {
  const ms = [...new Set(months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort(
    (a, b) => a - b,
  );
  if (ms.length === 0) return "";
  const runs: number[][] = [];
  for (const m of ms) {
    const last = runs[runs.length - 1];
    if (last && m === last[last.length - 1] + 1) last.push(m);
    else runs.push([m]);
  }
  return runs
    .map((r) => (r.length === 1 ? `${r[0]}月` : `${r[0]}〜${r[r.length - 1]}月`))
    .join("・");
}
