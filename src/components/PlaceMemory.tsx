/**
 * 場所による思い出しのUI。
 *
 * アプリを開いた/前面に戻したときに現在地を見て、そこで前に撮った言葉が
 * あれば **通知** と **画面上のカード** の両方で知らせる。
 * 通知だけだと見逃されるし、カードだけだと歩いている最中に気づけない。
 *
 * 位置情報は設定でONにした人だけ取りに行く(既定はOFF)。
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
  notifyMemory,
} from "@/lib/place-reminder";
import { Zh } from "@/components/Zh";
import { useT } from "@/lib/i18n";
import { daysAgoLabel } from "@/lib/timeago";

export function PlaceMemoryWatcher() {
  const t = useT();
  const fetchNearby = useServerFn(getNearbyMemories);
  const navigate = useNavigate();
  const [hit, setHit] = useState<NearbyMemory | null>(null);

  const check = useCallback(async () => {
    if (!isPlaceReminderEnabled()) return;
    const pos = await getCurrentPosition();
    if (!pos) return;
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

  const when = daysAgoLabel(hit.days_ago, t);

  return (
    <div className="fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" />
        </span>
        <button
          onClick={() => {
            setHit(null);
            void navigate({ to: "/dex", search: { justCaught: hit.sticker_id } });
          }}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-body font-semibold">
            {/* 単語の前後で文が分かれる。日本語は「〇〇」覚えてる?、英語は
                Remember "〇〇"? と語順が違うので前後を別キーにしている。
                単語だけ <Zh> で囲む必要があり、1文にまとめられない。 */}
            {t("place.rememberBefore")}
            <Zh>{hit.headword}</Zh>
            {t("place.rememberAfter")}
          </span>
          <span className="block truncate text-caption text-muted-foreground">
            {t("place.caughtHere", {
              when,
              where: hit.location_name
                ? t("place.atPlace", { name: hit.location_name })
                : t("place.hereAbouts"),
              meaning: hit.meaning_ja ? `(${hit.meaning_ja})` : "",
            })}
          </span>
        </button>
        <button
          onClick={() => setHit(null)}
          aria-label={t("common.close")}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
