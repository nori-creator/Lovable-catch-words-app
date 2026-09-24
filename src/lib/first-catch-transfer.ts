import { canRequestAccount, type FirstCatch } from "./first-catch";

/** Transfer orchestration has no UI/provider dependencies. The caller's authenticated
 * server functions enforce ownership; the draft never chooses an account to write to. */
export async function transferFirstCatch(
  draft: FirstCatch,
  userId: string,
  ports: {
    upload: (draft: FirstCatch) => Promise<string | null>;
    save: (draft: FirstCatch, path: string | null) => Promise<{ id: string }>;
    preferences: (draft: FirstCatch) => Promise<void>;
    persist: (draft: FirstCatch) => Promise<void>;
  },
): Promise<void> {
  if (draft.stage === "done" && draft.importedUserId === userId) return;
  if (!canRequestAccount(draft)) throw new Error("Catch has not been added");
  const path = await ports.upload(draft);
  if (!path) throw new Error("Photo was not uploaded");
  const saved = await ports.save(draft, path);
  if (!saved.id) throw new Error("Catch was not saved");
  await ports.preferences(draft);
  await ports.persist({ ...draft, stage: "done", importedUserId: userId, photo: null, card: null });
}
