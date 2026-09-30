import { describe, expect, it } from "vitest";
import { NATIVE_FNS, publicMessage, statusForError } from "./native-fn";

describe("native-fn allowlist", () => {
  it("exposes the capture, card, save and review functions iOS needs", () => {
    for (const name of [
      "suggestWords",
      "suggestWordCandidates",
      "generateCard",
      "saveSticker",
      "checkOwnedWord",
      "recordEncounter",
      "synthesizeSpeech",
      "gradeReview",
      "deleteMyAccount",
      "setStickerCategory",
      "saveMyCategory",
      "deleteMyCategory",
      "correctMyJournal",
      "getJournalPrompts",
      "listJournal",
      "getMyStats",
    ]) {
      expect(NATIVE_FNS[name]).toBeTypeOf("function");
    }
  });

  it("never exposes admin functions", () => {
    for (const name of Object.keys(NATIVE_FNS)) {
      expect(name.toLowerCase()).not.toContain("admin");
    }
    expect(NATIVE_FNS["setTtsVoiceAdmin"]).toBeUndefined();
    expect(NATIVE_FNS["pregenerateDictionaryTts"]).toBeUndefined();
  });

  it("does not resolve prototype keys", () => {
    expect(Object.prototype.hasOwnProperty.call(NATIVE_FNS, "constructor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(NATIVE_FNS, "__proto__")).toBe(false);
  });
});

describe("statusForError", () => {
  it("maps auth, cap, validation and other failures", () => {
    expect(statusForError(new Error("Unauthorized: Invalid token"))).toBe(401);
    expect(statusForError(new Error("1日の利用上限(200回)に達しました。"))).toBe(429);
    const zod = Object.assign(new Error("[]"), { name: "ZodError" });
    expect(statusForError(zod)).toBe(400);
    expect(statusForError(new Error("boom"))).toBe(500);
  });
});

describe("publicMessage", () => {
  it("hides validation internals and truncates long messages", () => {
    const zod = Object.assign(new Error('[{"path":["x"]}]'), { name: "ZodError" });
    expect(publicMessage(zod)).not.toContain("path");
    expect(publicMessage(new Error("x".repeat(1000))).length).toBe(300);
  });
});
