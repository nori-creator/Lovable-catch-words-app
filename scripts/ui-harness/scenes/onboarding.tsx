/** The former scan-only screen now previews the same first-run introduction. */
import { FirstCatchScene } from "./first-catch";

export function OnboardingScene({ q }: { q: URLSearchParams }) {
  return <FirstCatchScene q={q} />;
}
