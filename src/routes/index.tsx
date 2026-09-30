import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Public app entry.
 *
 * New/anonymous visitors must see the real first-run welcome screen first:
 * Welcome -> "Start" -> questions -> hands-on Catch tutorial -> account creation.
 * Returning authenticated members can go straight to Home.
 */
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    throw redirect({ to: user && !user.is_anonymous ? "/home" : "/welcome" });
  },
});