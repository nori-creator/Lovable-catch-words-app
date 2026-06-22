import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationItem = {
  id: string;
  type: string;
  post_id: string | null;
  created_at: string;
  read_at: string | null;
  actor: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationItem[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, post_id, created_at, read_at, actor_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      id: string; type: string; post_id: string | null; created_at: string; read_at: string | null; actor_id: string | null;
    }>;
    const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
    let actors: Array<{ id: string; display_name: string | null; avatar_url: string | null }> = [];
    if (actorIds.length) {
      const { data: p } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", actorIds);
      actors = (p ?? []) as typeof actors;
    }
    const map = new Map(actors.map((a) => [a.id, a]));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      post_id: r.post_id,
      created_at: r.created_at,
      read_at: r.read_at,
      actor: r.actor_id ? map.get(r.actor_id) ?? null : null,
    }));
  });

export const unreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
