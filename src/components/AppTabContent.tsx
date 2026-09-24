import type { LucideIcon } from "lucide-react";
/** Shared by the signed-in app and the guided first-run shell. */
export function AppTabContent({
  icon: Icon,
  label,
  camera,
  current,
}: {
  icon: LucideIcon;
  label: string;
  camera: boolean;
  current: boolean;
}) {
  return (
    <>
      {camera && !current ? (
        <span className="tabbar__lens-slot">
          <span className="tabbar__lens bg-primary text-primary-foreground shadow-lg shadow-primary/40">
            <Icon className="h-6 w-6" />
          </span>
        </span>
      ) : (
        <Icon
          className={`h-5 w-5 transition-transform duration-150 group-active:scale-90 ${camera && current ? "text-primary" : ""}`}
        />
      )}
      <span>{label}</span>
    </>
  );
}
