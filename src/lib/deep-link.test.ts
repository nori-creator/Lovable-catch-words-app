import { describe, expect, it } from "vitest";
import { routeFromNotificationExtra, routeFromUrl, WIDGET_LINKS } from "./deep-link";

describe("外から開かれたときの行き先", () => {
  it("ウィジェットのボタンはそれぞれの画面へ", () => {
    expect(routeFromUrl(WIDGET_LINKS.search)).toEqual({
      to: "/capture",
      search: { mode: "search" },
    });
    expect(routeFromUrl(WIDGET_LINKS.photo)).toEqual({ to: "/capture", search: { mode: "photo" } });
    expect(routeFromUrl(WIDGET_LINKS.scan)).toEqual({ to: "/scan", search: {} });
    expect(routeFromUrl(WIDGET_LINKS.review)).toEqual({ to: "/review", search: {} });
  });

  it("節目の通知はホームの記念アルバムへ", () => {
    expect(routeFromNotificationExtra({ route: "/home?memorial=30" })).toEqual({
      to: "/home",
      search: { memorial: 30 },
    });
    expect(routeFromUrl("catchwords://home?memorial=abc")).toEqual({ to: "/home", search: {} });
  });

  it("https の同じ道も受ける", () => {
    expect(routeFromUrl("https://example.app/review?sticker=abc-123")).toEqual({
      to: "/review",
      search: { sticker: "abc-123" },
    });
  });

  it("知らない行き先・変な値・ほかの形は受けない", () => {
    expect(routeFromUrl("catchwords://admin.metrics")).toBeNull();
    expect(routeFromUrl("javascript:alert(1)")).toBeNull();
    expect(routeFromUrl("http://example.app/review")).toBeNull();
    expect(routeFromUrl("not a url")).toBeNull();
    expect(routeFromUrl("catchwords://capture?mode=evil")).toEqual({ to: "/capture", search: {} });
    expect(routeFromUrl("catchwords://review?sticker=%3Cscript%3E")).toEqual({
      to: "/review",
      search: {},
    });
  });

  it("通知: 場所の通知はその語の復習、復習の通知は復習へ", () => {
    expect(routeFromNotificationExtra({ sticker_id: "s1" })).toEqual({
      to: "/review",
      search: { sticker: "s1" },
    });
    expect(routeFromNotificationExtra({ route: "/review" })).toEqual({ to: "/review", search: {} });
    expect(routeFromNotificationExtra(null)).toBeNull();
  });
});
