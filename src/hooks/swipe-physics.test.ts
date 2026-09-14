/**
 * スワイプの物理。**指の手応えは、ここの数で決まる。**
 *
 * 画面の横スワイプと戻るスワイプは、離した瞬間に「送るか、戻すか」を
 * 決める。その判定が距離だけだと、**速く短く払う操作が通らない** —
 * iOS で人がいちばんよくやる送り方がこれなので、通らないと
 * 「反応が悪い」とだけ感じて、なぜかは分からない。
 *
 * ここでは `lib/spring.ts` の3つ(`rubberband` / `projectMomentum` /
 * `velocityFrom`)が、指の動きに対して期待どおりの数を返すことを見る。
 * フック本体は `window` のイベントに繋がっているので、判定に使う数の側で止める。
 */
import { describe, expect, it } from "vitest";
import { projectMomentum, rubberband, velocityFrom } from "@/lib/spring";

/** 実際の判定と同じ式。距離 + 弾いた先が閾値を越えるか。 */
const commits = (dx: number, velocity: number, width: number) =>
  Math.abs(dx + projectMomentum(velocity)) > Math.max(60, width * 0.16);

describe("離した瞬間の判定（弾いた先を見る）", () => {
  const W = 390; // iPhone 14 の幅。閾値は max(60, 390×0.16) = 62.4px

  it("**速く短く払うと送れる**（距離だけ見ていた頃は通らなかった）", () => {
    // 40px しか動いていないが、秒速 900px で払っている。
    // 距離だけなら 40 < 62.4 で不成立。弾いた先まで見ると成立する。
    expect(Math.abs(40)).toBeLessThan(62.4);
    expect(commits(-40, -900, W)).toBe(true);
  });

  it("ゆっくり大きく引いても送れる（従来どおり）", () => {
    expect(commits(-120, -50, W)).toBe(true);
  });

  it("少し触れただけでは送らない（誤操作で画面が変わらない）", () => {
    expect(commits(-12, -30, W)).toBe(false);
  });

  it("**そっと戻しかけたら取り消す**（弾いた先が閾値の内側に入る）", () => {
    // 右へ 80px 引いたが、離す直前にそっと戻している(秒速 200px)。
    // 位置だけで決めると送ってしまう。弾いた先は -19.8px で、送らない。
    expect(80).toBeGreaterThan(62.4); // 距離だけなら成立してしまう
    expect(commits(80, -200, W)).toBe(false);
  });

  it("**強く逆へ払ったら、払った向きへ送る**（勢いが位置に勝つ）", () => {
    // 右へ 80px 引いた指が、離す瞬間に左へ秒速 1200px で払われた。
    // 弾いた先は -518px。**取り消しではなく、左へ送る**のが iOS の作法 —
    // 人は最後の一払いで行き先を決めている。
    const projected = 80 + projectMomentum(-1200);
    expect(projected).toBeLessThan(-62.4);
    expect(commits(80, -1200, W)).toBe(true);
    // 向きも弾いた先で決まる(実装の `projected < 0 ? 1 : -1` と同じ)。
    expect(projected < 0).toBe(true);
  });
});

describe("端の抵抗（引くほど重くなる）", () => {
  const W = 390;

  it("**一定の割合で薄めるのではない**（`× 0.22` との違い）", () => {
    // 引き始めは素直に付いてくる。
    const small = rubberband(20, W);
    expect(small).toBeGreaterThan(20 * 0.22);
    // 引くほど、付いてくる割合が落ちる。
    const ratioSmall = rubberband(20, W) / 20;
    const ratioBig = rubberband(200, W) / 200;
    expect(ratioBig).toBeLessThan(ratioSmall);
  });

  it("どれだけ引いても、ある所で頭打ちになる（画面外へ飛ばない）", () => {
    expect(rubberband(10_000, W)).toBeLessThan(W);
  });

  it("引いていなければ動かない", () => {
    expect(rubberband(0, W)).toBe(0);
  });
});

describe("離した速度（数フレーム分をまとめて見る）", () => {
  it("**最後の1点だけ見ない**（指が止まった瞬間に 0 になる）", () => {
    // 動いたあと、最後の1フレームだけ止まっている指。
    const history = [
      { t: 0, x: 0 },
      { t: 16, x: 30 },
      { t: 32, x: 60 },
      { t: 48, x: 60 },
    ];
    // 最後の2点だけなら 0。全体で見れば、まだ速度が残っている。
    expect(velocityFrom(history)).toBeGreaterThan(0);
  });

  it("点が1つしかなければ速度は出せない", () => {
    expect(velocityFrom([{ t: 0, x: 0 }])).toBe(0);
    expect(velocityFrom([])).toBe(0);
  });
});
