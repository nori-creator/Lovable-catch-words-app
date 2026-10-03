/**
 * **指で触る**（マウスではなく）。iPhone の Safari でシールがはがせなかった件（2026-10-03）は、
 * マウスで押す自動操作では一度も出なかった — 指の時だけ iOS が巻き取りに回して
 * `pointercancel` を送るため。ここは実物確認（`run.mjs`）とシールの指の検査
 * （`scripts/peel-touch-check.mjs`）が同じ指の動きを使うための小さな道具。
 *
 * - Chromium: CDP の `Input.dispatchTouchEvent`（本物の入力の道。Touch と Pointer の両方が出る）。
 * - WebKit: Playwright に指で引く操作が無いので、押した所の要素へ `TouchEvent` を順に送る
 *   （Pointer Events は出ない — Touch だけで動く端末と同じ。シールは `touchstart` から始める）。
 *   作れない版ではマウスに戻し、戻したことを返す。
 * - 軽く押すだけ（タップ）は、どちらも `page.touchscreen.tap`（本物の指の入力）。
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sessions = new WeakMap();

function browserNameOf(page) {
  return page.context().browser()?.browserType().name() ?? "chromium";
}

async function cdp(page) {
  if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
  return sessions.get(page);
}

/** 指で押して離す。 */
export async function touchTap(page, x, y) {
  await page.touchscreen.tap(x, y);
  return "touch";
}

/**
 * 指で `from` から `to` へ引く。返り値は使った入力（"touch" / "mouse"）。
 * @param {import("playwright").Page} page
 */
export async function touchDrag(page, from, to, { steps = 14, stepMs = 16 } = {}) {
  const name = browserNameOf(page);
  if (name === "chromium") {
    const session = await cdp(page);
    const send = (type, points) =>
      session.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    await send("touchStart", [{ x: from.x, y: from.y }]);
    for (let i = 1; i <= steps; i++) {
      await send("touchMove", [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ]);
      await sleep(stepMs);
    }
    await send("touchEnd", []);
    return "touch";
  }
  const ok = await page
    .evaluate(
      async ({ from, to, steps, stepMs }) => {
        const target = document.elementFromPoint(from.x, from.y);
        if (!target) return false;
        const make = (x, y) => {
          const init = {
            identifier: 1,
            target,
            clientX: x,
            clientY: y,
            pageX: x + scrollX,
            pageY: y + scrollY,
            screenX: x,
            screenY: y,
          };
          try {
            return new Touch(init);
          } catch {
            // 古い WebKit: `document.createTouch`（非推奨だが iOS の Safari にはある）。
            return document.createTouch?.(window, target, 1, init.pageX, init.pageY, x, y) ?? null;
          }
        };
        const fire = (type, touch) => {
          const list = type === "touchend" ? [] : [touch];
          let event;
          try {
            event = new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              touches: list,
              targetTouches: list,
              changedTouches: [touch],
            });
          } catch {
            return false;
          }
          target.dispatchEvent(event);
          return true;
        };
        const first = make(from.x, from.y);
        if (!first || !fire("touchstart", first)) return false;
        let last = first;
        for (let i = 1; i <= steps; i++) {
          last = make(
            from.x + ((to.x - from.x) * i) / steps,
            from.y + ((to.y - from.y) * i) / steps,
          );
          fire("touchmove", last);
          await new Promise((r) => setTimeout(r, stepMs));
        }
        fire("touchend", last);
        return true;
      },
      { from, to, steps, stepMs },
    )
    .catch(() => false);
  if (ok) return "touch";
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await sleep(stepMs);
  }
  await page.mouse.up();
  return "mouse";
}
