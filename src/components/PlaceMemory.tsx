/**
 * 場所による思い出しのUI。
 *
 * アプリを開いた/前面に戻したときに現在地を見て、そこで前に撮った言葉が
 * あれば **通知** と **画面上のカード** の両方で知らせる。
 * 通知だけだと見逃されるし、カードだけだと歩いている最中に気づけない。
 *
 * 位置情報は設定でONにした人だけ取りに行く(既定はOFF)。
 *
 * ## 2026-08-19 の作り直し(オーナー指摘4件)
 * - **上から出す。** 下から出していたが、通知は端末では上から降りてくる。
 *   同じ知らせが場所によって上下から来ると、別の物に見える。
 * - **撮ったときの写真を必ず付ける。** 場所の丸い印では何も思い出せない。
 *   思い出す手がかりは写真そのもの。
 * - **押したら復習が始まる。** 図鑑へ飛ばすだけだった。カードを眺めるのと
 *   思い出そうとするのは別の行為で、この知らせが誘いたいのは後者。
 * - **訳は出さない。** 「覚えてる?」と聞いておいて答えを並べていた。
 */

import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { MapPin, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { getNearbyMemories, type NearbyMemory } from "@/lib/nearby.functions";
import {
  filterUnnotified,
  getCurrentPosition,
  isPlaceReminderEnabled,
  markNotified,
  mayNotifyAt,
  notifyMemory,
  placeCellKey,
  readPlaceLog,
  recordNotificationAt,
  writePlaceLog,
  takenDateLabel,
  learningLanguageName,
} from "@/lib/place-reminder";
import { useT } from "@/lib/i18n";

export function PlaceMemoryWatcher() {
  const fetchNearby = useServerFn(getNearbyMemories);
  const navigate = useNavigate();
  const [hit, setHit] = useState<NearbyMemory | null>(null);

  const check = useCallback(async () => {
    if (!isPlaceReminderEnabled()) return;
    const pos = await getCurrentPosition();
    if (!pos) return;
    // **同じ場所では1日1回まで、1日の合計も上限まで**（2026-09-27「家にいると
    // 延々と通知が来る」）。問い合わせる前に見る — 鳴らさないなら通信も要らない。
    const cell = placeCellKey(pos);
    if (!mayNotifyAt(cell, new Date(), readPlaceLog())) return;
    let found: NearbyMemory[] = [];
    try {
      found = await fetchNearby({ data: { lat: pos.lat, lng: pos.lng, radius_m: 150, limit: 5 } });
    } catch {
      return; // 通信できないときは黙って諦める
    }
    // filterUnnotified は最小限の形しか要求しないので、絞り込んだ ID から
    // 元の完全な情報(画像URLなど)を引き直す。
    const freshIds = new Set(filterUnnotified(found).map((m) => m.sticker_id));
    const fresh = found.filter((m) => freshIds.has(m.sticker_id));
    if (fresh.length === 0) return;
    // 一度にたくさん鳴らすと鬱陶しいので、一番近い1つだけ。
    const top = fresh[0];
    await notifyMemory(top);
    markNotified([top]);
    writePlaceLog(recordNotificationAt(cell, new Date(), readPlaceLog()));
    setHit(top);
  }, [fetchNearby]);

  useEffect(() => {
    // 起動直後は他の読み込みと競合するので、少しだけ待ってから。
    const t = setTimeout(() => void check(), 2500);
    return () => clearTimeout(t);
  }, [check]);

  // 前面に戻ってきたとき(別のアプリから帰ってきたとき)にも見る。
  // 歩いている途中でアプリを開き直す動きに合わせる。
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app").then(({ App }) => {
        const h = App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void check();
        });
        cleanup = () => void h.then((x) => x.remove());
      });
    } else if (typeof document !== "undefined") {
      const onVis = () => {
        if (document.visibilityState === "visible") void check();
      };
      document.addEventListener("visibilitychange", onVis);
      cleanup = () => document.removeEventListener("visibilitychange", onVis);
    }
    return () => cleanup?.();
  }, [check]);

  if (!hit) return null;

  return (
    <PlaceMemoryCard
      memory={hit}
      onDismiss={() => setHit(null)}
      onStart={() => {
        setHit(null);
        void navigate({ to: "/review", search: { sticker: hit.sticker_id } });
      }}
    />
  );
}

/**
 * 知らせそのもの。通信も位置も持たないので、検査の雛形からそのまま撮れる。
 *
 * ## B「写真を大きく」（オーナー決定 2026-09-27）
 * 思い出す手がかりは写真なので、写真を上いっぱいに出し、その下に
 * 「地名 · 日付」と問い「ここで撮った、これ。台湾華語で言える？」、
 * ボタンは「復習する」「あとで」。写真が無い語（文字から作った語）は
 * 手がかりが無いので、母語で問う1行の形のまま。
 */
export function PlaceMemoryCard({
  memory,
  onStart,
  onDismiss,
}: {
  memory: Pick<NearbyMemory, "headword" | "location_name" | "image_url"> & {
    taken_at?: string | null;
    meaning_ja?: string | null;
  };
  onStart: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const date = takenDateLabel(memory.taken_at);
  const lang = learningLanguageName(memory.headword);
  const line = date
    ? t("place.caughtOn", { date })
    : memory.location_name
      ? t("place.caughtAt", { name: memory.location_name })
      : t("place.caughtHereShort");
  const meta = [memory.location_name?.trim(), date].filter(Boolean).join(" · ");
  return (
    // **上から。** 端末の通知と同じ向きから降りてくる。
    // 安全域(ノッチ)を避けてから、その下に置く。
    <div className="fixed inset-x-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 material-in mx-auto max-w-md">
      {/* **地はテーマに従わせる。** 明るい面を前提にした固定の白と濃紺を
          直に書いていたので、暗いテーマでは白い板が1枚だけ浮き、しかも
          中の字はトークンなので**白地に明るい灰色**になっていた（実測 2.21）。 */}
      {memory.image_url ? (
        <div className="relative overflow-hidden rounded-[28px] border border-border bg-card/95 text-foreground shadow-[0_14px_50px_#147bc522] backdrop-blur-xl">
          <img
            src={memory.image_url}
            alt=""
            className="aspect-[16/10] max-h-[32vh] w-full object-cover"
          />
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("common.close")}
            className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/35 text-white backdrop-blur active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="p-4">
            {meta && <p className="truncate text-footnote text-muted-foreground">{meta}</p>}
            <p className="mt-0.5 text-headline font-bold">{t("place.sayItIn", { lang })}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onStart}
                className="min-h-11 flex-1 rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground active:scale-[0.98]"
              >
                {t("place.review")}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="min-h-11 rounded-full bg-secondary px-5 text-body font-semibold text-foreground active:scale-[0.98]"
              >
                {t("place.later")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[28px] border border-border bg-card/95 p-4 text-foreground shadow-[0_14px_50px_#147bc522] backdrop-blur-xl">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink">
            <MapPin className="h-5 w-5" />
          </span>
          <button type="button" onClick={onStart} className="min-w-0 flex-1 py-1 text-left">
            <span className="block truncate text-body font-semibold">
              {/* 単語の前後で文が分かれる。日本語は「〇〇」は台湾華語で？、英語は
                  Remember "〇〇" in Mandarin? と語順が違うので前後を別キーにしている。 */}
              {t("place.rememberBefore")}
              <span>{memory.meaning_ja?.trim() || t("place.thisWord")}</span>
              {t("place.rememberAfter", { lang })}
            </span>
            <span className="block truncate text-caption text-muted-foreground">{line}</span>
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("common.close")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
