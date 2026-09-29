/**
 * **3D の本棚を先に温めておく**（オーナー指示 R19「アプリを開いた瞬間、平らな仮の絵ではなく
 * 3D の本棚がすぐ開くように」）。
 *
 * 3D が出るまでには、three.js を含む塊（`engine`）の読み込みと、棚・本・木目の 3 ファイル
 * （合わせて約 150KB）の取得が要る。これまでは「ホームを描き終えて手が空いたら」その 2 つを
 * **順に**始めていたので、アルバムの写真を読み込み中の端末では手が空くのが遅れ、その間ずっと
 * 仮の棚だけが見えていた。ここでは**ホームの塊を読んだ瞬間に両方を並べて始める**。
 * 取得した物は HTTP キャッシュに残るので、あとで棚を組む時はほぼ待たない。
 */
let warmed = false;

export const SHELF_ASSETS = ["/models/book.glb", "/models/shelf.glb", "/models/wood.jpg"] as const;

export function prewarmShelf(): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  void import("./engine").catch(() => {
    warmed = false;
  });
  for (const url of SHELF_ASSETS) void fetch(url).catch(() => undefined);
}
