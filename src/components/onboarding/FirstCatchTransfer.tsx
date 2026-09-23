import { transferFirstCatch } from "@/lib/first-catch-transfer";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { saveSticker } from "@/lib/stickers.functions";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { uploadStickerImage } from "@/lib/sticker-upload";
import { readFirstCatch, writeFirstCatch, type FirstCatch } from "@/lib/first-catch";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { learningPreferencesOf, LearningPreferencesSchema } from "@/lib/learning-preferences";
import { FirstCatchHome } from "./FirstCatchHome";
import "./first-catch.css";

// One import per tab, including StrictMode's effect re-entry. Server idempotency
// also protects retries, multiple tabs and a lost response after INSERT.
const transfers = new Map<string, Promise<void>>();
export function FirstCatchTransfer({
  draft,
  userId,
  onDone,
}: {
  draft: FirstCatch;
  userId: string;
  onDone: () => void;
}) {
  const t = useT();
  const save = useServerFn(saveSticker);
  const profile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  const qc = useQueryClient();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const key = `${userId}/${draft.id}`;
    if (!transfers.has(key)) {
      transfers.set(
        key,
        (async () => {
          const current = await readFirstCatch();
          if (!current || current.id !== draft.id) throw new Error("Draft changed");
          await transferFirstCatch(current, userId, {
            upload: (current) =>
              uploadStickerImage({
                userId,
                dataUrl: current.photo,
                kind: `first-${current.id}`,
                ts: new Date(current.capturedAt!).getTime(),
                allowExisting: true,
              }),
            save: (current, path) =>
              save({
                data: {
                  client_catch_id: current.id,
                  language: current.targetLanguage,
                  object_path: path,
                  word: { ...current.card!, headword: current.card!.headword_zh },
                },
              }),
            preferences: async (current) => {
              const { data: auth, error: authError } = await supabase.auth.getUser();
              if (authError || auth.user?.id !== userId) throw new Error("Account changed");
              if (!learningPreferencesOf(auth.user.user_metadata?.learning_preferences)) {
                const { error } = await supabase.auth.updateUser({
                  data: { learning_preferences: LearningPreferencesSchema.parse(current) },
                });
                if (error) throw error;
              }
              const existing = await profile();
              if (!existing?.onboarded) {
                const result = await update({
                  data: {
                    onboarded: true,
                    ui_language: current.uiLanguage,
                    target_language: current.targetLanguage,
                  },
                });
                if ("skipped" in result && result.skipped?.length)
                  throw new Error("Preferences not saved");
              }
            },
            persist: writeFirstCatch,
          });
          await qc.invalidateQueries();
        })().finally(() => transfers.delete(key)),
      );
    }
    transfers
      .get(key)!
      .then(() => {
        if (active) onDone();
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [userId, draft.id, attempt]);
  return (
    <>
      <div inert aria-hidden="true">
        <FirstCatchHome draft={draft} />
      </div>
      <div className="first-account">
        <div className="first-account-sheet" role="status">
          <h1>{t(error ? "first.importFailed" : "first.importing")}</h1>
          {error && (
            <button
              className="first-primary mt-6"
              onClick={() => {
                setError(false);
                setAttempt((n) => n + 1);
              }}
            >
              {t("first.retry")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
