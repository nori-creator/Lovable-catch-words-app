import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanLine, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { createSpring } from "@/lib/spring";
import { motionReducedNow } from "@/hooks/use-reduced-motion";
import type { CameraMode } from "@/components/CameraChrome";
import { CAMERA_MODES } from "@/components/CameraChrome";

/**
 * 撮り方を選ぶ**ダイヤル**。3つの**孤（こ＝円弧）**がシャッターの丸に
 * ぴったり沿い、**3つでちょうど1周**する。
 *
 * ## オーナー指示 2026-09-16
 * > 「カメラの画面はこのアプリと同じ青い色をベースにAppleのなめらかさ、
 * >  美しさ、人間工学に基づいてデザインし直して。またシャッターボタンの
 * >  周りにぴったり沿うように3つのモードを孤にして。3つでシャッターボタンを
 * >  1周するように。」
 *
 * ## 何が変わったか（前の版＝浮いた粒3つ）
 * 前は名前を書いた**カプセルが3つ、輪の上に浮いている**形だった。粒と粒の
 * 間は空いていて、そこを押しても何も起きない — つまり**押せる所が輪の上に
 * 飛び飛びにある**。指は輪をなぞるのに、当たるのは3点だけ。
 *
 * いまは輪そのものが3つの孤に分かれ、**輪の上のどこを押しても必ずどれかに
 * 当たる**。隙間は 6° の切れ目だけで、これは「3つに分かれている」ことを
 * 目で見せるための線であって、押せない場所を作るためではない。
 *
 * ## 寸法（すべて px。ブラウザで実測して決めた）
 * ```
 *   シャッター  直径 76          … 半径 38
 *   孤の内側    半径 44          … シャッターの縁から 6px 外
 *   孤の外側    半径 88          … 帯の太さ 44px（HIG §11 の下限ちょうど）
 *   名前と絵    半径 66          … 帯の真ん中
 *   箱の高さ    196              … 外径 176 ＋ 影の余白
 * ```
 * 帯の太さを 44px にしてあるので、**孤のどこを押しても指の当たりは
 * 44px を割らない**。前の版は粒（高さ 44px）だけが当たりだった。
 *
 * ## 字の向き
 * 輪は回るが、**名前と絵は回らない**（輪と逆に回して打ち消す）。回る輪に
 * 字を貼ると、選んでいない2つが逆さまになる — 本物のカメラのダイヤルは
 * そうなっているが、指標を読む機械と違ってここは**一目で選ぶ**画面なので、
 * 傾いた字は用を成さない。
 *
 * 名前を出すのは**選ばれている1つだけ**（＝いつも真上）。残り2つは絵だけ。
 * 3つとも名前を出すと、真上以外の2つは帯の外へはみ出す（「写真を撮る」は
 * 13px で 65px 幅あり、斜めの位置では帯の外周 88px を 10px 超える）。
 * 絵には `aria-label` で名前が付いているので、読み上げでは3つとも名前で読む。
 */

/** 刻みの間隔(度)。3つなので 120 — **これが「3つで1周」の正体**。 */
const STEP = 360 / 3;
/** 孤と孤の切れ目(度)。押せない場所ではなく、分かれ目を見せる線。 */
const GAP = 6;
/** シャッターの直径(px)。 */
const SHUTTER = 76;
/** 孤の内側の半径(px)。シャッターの縁(38)から 6px 外＝「ぴったり沿う」。 */
const R_IN = 44;
/** 孤の外側の半径(px)。帯の太さが 44px になる所（HIG §11）。 */
const R_OUT = 88;
/**
 * 絵を置く半径(px)。帯の真ん中(66)より少し外。
 *
 * 選ばれている孤では、絵の**すぐ下に名前がぶら下がる**。真ん中に置くと
 * 名前が帯の内側(44)を越えてシャッターに掛かるので、絵のぶんだけ外へ
 * 逃がしてある（実測: 絵は半径 60〜80、名前は 45〜58 に収まる）。
 */
const R_ICON = 70;
/** 箱の一辺(px)。外径 176 に影のぶんを足す。 */
const BOX = 196;
/** 1px 滑らせるごとに輪が回る角度。半径ぶん動かすと 1 刻みぶん回る。 */
const DEG_PER_PX = STEP / 120;

/** 撮り方ごとのシャッターの絵（オーナー指示「切り替えるとアイコンも変化」）。 */
const SHUTTER_ICON: Record<CameraMode, typeof Camera> = {
  photo: Camera,
  search: Search,
  scan: ScanLine,
};

const MODE_KEY: Record<CameraMode, string> = {
  search: "capture.typeWord",
  photo: "capture.photoTitle",
  scan: "scan.button",
};

/** 極座標 → 箱の中の座標。0° が真上、時計回り。 */
function at(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [BOX / 2 + r * Math.cos(rad), BOX / 2 + r * Math.sin(rad)] as const;
}

/**
 * 孤ひとつ分の道（ドーナツの一切れ）。外周を進み、内周を戻って閉じる。
 * 3つ並べると切れ目のぶんを除いて**円が1周ぶん埋まる**。
 */
function sector(center: number) {
  const a0 = center - STEP / 2 + GAP / 2;
  const a1 = center + STEP / 2 - GAP / 2;
  const [x0, y0] = at(R_OUT, a0);
  const [x1, y1] = at(R_OUT, a1);
  const [x2, y2] = at(R_IN, a1);
  const [x3, y3] = at(R_IN, a0);
  return `M ${x0} ${y0} A ${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${R_IN} ${R_IN} 0 0 0 ${x3} ${y3} Z`;
}

const SECTORS = CAMERA_MODES.map((_, i) => sector(i * STEP));

/**
 * 投げた指の行き先を見積もる（apple-design §18「勢いの投影」）。
 *
 * 離した所にいちばん近い刻みへ寄せるだけだと、**勢いよく払っても隣へ
 * 行かない**ことがある。指が向かっていた先を見積もってから、そこに
 * いちばん近い刻みを選ぶ。`decel` は iOS の UIScrollView と同じ 0.998。
 *
 * **ただし1刻みぶんで頭打ちにする。** 見積もりは「指を離したあと惰性で
 * どこまで流れるか」の式で、長い一覧を滑らせる前提の値。刻みが3つしか
 * 無い輪にそのまま当てると、ひと払い（実測 833°/秒）で **416° ＝ 1周と
 * ちょっと**流れて元の撮り方に戻ってくる（実測でそうなった）。
 * カメラの撮り方は隣へ1つずつ移るもので、回し過ぎる意味が無い。
 */
function project(velocity: number, decel = 0.998) {
  const raw = ((velocity / 1000) * decel) / (1 - decel);
  return Math.max(-STEP, Math.min(STEP, raw));
}

/** 押したと見なす動きの上限(px)。これを超えたら「回した」。 */
const TAP_PX = 8;

/**
 * 指の位置が**どの孤の上か**を返す（帯の外なら `null`）。
 *
 * 画面の上での角度から輪の回転を引くと、輪の中での角度になる。
 * 撮り方はその中で 0°/120°/240° に居るので、いちばん近い物を選ぶ。
 */
function modeAtPoint(
  root: HTMLElement | null,
  clientX: number,
  clientY: number,
  ringDeg: number,
): CameraMode | null {
  if (!root) return null;
  const box = root.getBoundingClientRect();
  const dx = clientX - (box.x + box.width / 2);
  const dy = clientY - (box.y + box.height / 2);
  const r = Math.hypot(dx, dy);
  if (r < R_IN || r > R_OUT) return null;
  // 真上を 0、時計回り。
  const screenDeg = ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360;
  const localDeg = (((screenDeg - ringDeg) % 360) + 360) % 360;
  const i = Math.round(localDeg / STEP) % CAMERA_MODES.length;
  return CAMERA_MODES[i] ?? null;
}

export function CameraDial({
  mode,
  onChange,
  onShutter,
  busy = false,
  shutterLabel,
  className = "",
}: {
  mode: CameraMode;
  onChange: (m: CameraMode) => void;
  /** 真ん中を押したとき。 */
  onShutter: () => void;
  /**
   * 走っている間はシャッターを止め、**真ん中で回して見せる**。
   * 止めるだけだと、押したのに何も起きていないように見える（§8）。
   */
  busy?: boolean;
  shutterLabel: string;
  className?: string;
}) {
  const t = useT();
  const ringRef = useRef<HTMLDivElement | null>(null);
  const contentRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const index = Math.max(0, CAMERA_MODES.indexOf(mode));
  const Icon = SHUTTER_ICON[mode];

  /**
   * 輪の角度(度)。**画面に出ている値**はばねが持ち、React の状態には
   * 置かない — 1コマごとに状態を書き換えると、指の追従がその都度の
   * 再描画に律速される（§14「押した瞬間に応える」）。
   */
  const angleRef = useRef(-index * STEP);
  const springRef = useRef<ReturnType<typeof createSpring> | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const paint = (deg: number) => {
      angleRef.current = deg;
      const ring = ringRef.current;
      if (!ring) return;
      ring.style.rotate = `${deg}deg`;
      // 名前と絵は水平のまま。輪と逆に回して打ち消す。
      for (const el of contentRefs.current) if (el) el.style.rotate = `${-deg}deg`;
    };
    /**
     * 回す物なので `damping` は 1 未満（apple-design §17 の表「Rotation
     * … damping 0.8 / response 0.4」）。行き過ぎて戻る一拍が、輪が
     * 刻みに落ちた感触になる。
     */
    const sp = createSpring(angleRef.current, paint, { damping: 0.8, response: 0.4 });
    springRef.current = sp;
    paint(angleRef.current);
    return () => sp.dispose();
  }, []);

  // 外から撮り方が変わったとき（帯以外から選ばれた回）も輪を合わせる。
  useEffect(() => {
    const sp = springRef.current;
    if (!sp) return;
    const want = -index * STEP;
    // いちばん近い同じ向きへ寄せる（-240° ではなく +120° へ回る）。
    const now = sp.value();
    const wrapped = want + Math.round((now - want) / 360) * 360;
    if (motionReducedNow()) sp.set(wrapped);
    else sp.to(wrapped);
  }, [index]);

  /** 指で滑らせて回す。 */
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    from: number;
    t: number;
    v: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const sp = springRef.current;
    if (!sp) return;
    sp.stop();
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      from: sp.value(),
      t: e.timeStamp,
      v: 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const sp = springRef.current;
    if (!d || !sp || d.id !== e.pointerId) return;
    const deg = d.from + (e.clientX - d.x) * DEG_PER_PX;
    // 離したときに渡す速度(度/秒)。直前の1コマから出す。
    const dt = (e.timeStamp - d.t) / 1000;
    if (dt > 0) d.v = (deg - sp.value()) / dt;
    d.t = e.timeStamp;
    sp.set(deg);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    const sp = springRef.current;
    if (!d || !sp || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);

    /**
     * **ほとんど動いていなければ「押した」。**
     *
     * 押して選ぶのを `onClick` に任せられない。輪の上で指を捕まえている
     * （`setPointerCapture`）ので、`pointerdown` も `pointerup` も
     * **この外側の箱**に届く。ブラウザは両方の共通の親へ `click` を出すので、
     * 孤そのものには一度も届かない（実測: 孤を押しても撮り方が変わらなかった）。
     *
     * そこで、離した所の**角度**から撮り方を出す。輪の上のどこを押しても
     * 必ずどれかの孤に当たるので、狙いを外して何も起きない、が無い。
     */
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    const hit =
      moved < TAP_PX ? modeAtPoint(rootRef.current, e.clientX, e.clientY, sp.value()) : null;
    if (hit) {
      // 行き先が変われば、上の `useEffect` が輪を回して合わせる。
      if (hit !== mode) onChange(hit);
      // いま居る所を押した回は誰も回さないので、ここで刻みへ戻す。
      // 押したつもりでも指は数 px 動くので、戻さないと少し傾いたまま残る。
      else sp.to(Math.round(sp.value() / STEP) * STEP);
      return;
    }

    /**
     * 離した所ではなく、**指が向かっていた先**にいちばん近い刻みへ。
     * そのうえで離したときの速度をばねに引き継ぐ（§18）— 引き継がないと
     * 指と動きの間に継ぎ目ができ、「壁にぶつかった」感じになる。
     */
    const aim = sp.value() + project(d.v);
    const snapped = Math.round(aim / STEP) * STEP;
    sp.to(snapped, { velocity: d.v });
    const i = ((Math.round(-snapped / STEP) % 3) + 3) % 3;
    if (CAMERA_MODES[i] !== mode) onChange(CAMERA_MODES[i]);
  };

  return (
    <div
      ref={rootRef}
      className={`camera-dial ${className}`}
      role="group"
      aria-label={t("camera.modeGroup")}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 回る輪。孤と、その上の名前・絵が一緒に回る。 */}
      <div className="camera-dial__ring" ref={ringRef}>
        {/*
          孤そのものが**指の当たり**。名前の粒だけを押せるようにすると、
          輪の上に押せない隙間ができる（前の版の作り）。
          押したときの行き先は `onPointerUp` が**角度から**決める（`onClick`
          は捕まえている間この道まで届かない。下の注を見よ）。
          読み上げ・鍵盤で辿るのは下の `<button>` のほうなので、ここは
          `aria-hidden` のまま — **同じ物が2つ読み上げられない**ようにする。
        */}
        <svg className="camera-dial__arcs" viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
          {CAMERA_MODES.map((m, i) => (
            <path
              key={m}
              className="camera-dial__arc"
              data-on={m === mode || undefined}
              d={SECTORS[i]}
            />
          ))}
        </svg>

        {CAMERA_MODES.map((m, i) => {
          // 真上を 0 とし、時計回りに 120° ずつ。
          const deg = i * STEP;
          const [x, y] = at(R_ICON, deg);
          const Glyph = SHUTTER_ICON[m];
          return (
            <button
              key={m}
              type="button"
              className="camera-dial__label"
              data-on={m === mode || undefined}
              aria-current={m === mode ? "true" : undefined}
              // 絵だけの回もあるので、名前は必ず読み上げに残す。
              aria-label={t(MODE_KEY[m])}
              /**
               * **真ん中合わせは `margin` でやる。`translate` ではない。**
               *
               * この箱は回る輪の子なので、`translate: -50% -50%` を使うと
               * **その -50% ごと輪の角度で回る** — 半分ずらしたはずの向きが
               * 傾き、絵が孤の外へ飛び出す（実測: 選ばれている物が輪の外、
               * 映像の上に出ていた）。`margin` は組版の側の値なので回らない。
               * だから箱の大きさを決め打ちして、その半分を負の余白で戻す。
               */
              /**
               * 位置は**中心からのずれ**で書く。割合で書いてはいけない —
               * 輪(`.camera-dial__ring`)は `inset: 0` で親の幅いっぱい
               * (390px)に広がっていて、`196` の箱ではない。`x/196` を
               * 割合にすると 390px に対して解かれ、**孤の外へ飛ぶ**
               * （実測: 選ばれている物が中心から 122px 上、輪の外）。
               */
              style={{
                left: `calc(50% + ${Math.round((x - BOX / 2) * 10) / 10}px)`,
                top: `calc(50% + ${Math.round((y - BOX / 2) * 10) / 10}px)`,
              }}
              onClick={() => {
                if (m !== mode) onChange(m);
              }}
            >
              <span
                className="camera-dial__content"
                ref={(el) => {
                  contentRefs.current[i] = el;
                }}
              >
                <Glyph className="camera-dial__glyph" aria-hidden="true" />
                {/* 名前は選ばれている1つだけ（＝いつも真上）。上の注を見よ。 */}
                <span className="camera-dial__name">{t(MODE_KEY[m])}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        真ん中のシャッター。**絵は撮り方で変わる**（オーナー指示）。
        押す物なので輪の回転からは外し、いつでも同じ場所・同じ向き。
      */}
      <button
        type="button"
        className="capture-shutter camera-dial__shutter"
        aria-label={shutterLabel}
        disabled={busy}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onShutter}
      >
        <span className="capture-shutter__core camera-dial__core">
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Icon className="h-6 w-6" strokeWidth={2.2} />
          )}
        </span>
      </button>
    </div>
  );
}
