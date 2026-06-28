import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/map")({
  beforeLoad: () => {
    throw redirect({ to: "/dex" });
  },
  component: () => null,
});
