export const REVIEW_PRACTICE_ENABLED: boolean = false;
export const WORDBOOKS_ENABLED: boolean = false;
export function selfieCaptureEnabled() {
  try {
    return localStorage.getItem("cw-selfie-capture") !== "0";
  } catch {
    return true;
  }
}
export function setSelfieCaptureEnabled(on: boolean) {
  try {
    localStorage.setItem("cw-selfie-capture", on ? "1" : "0");
  } catch {
    /* Preference remains active for this session. */
  }
}
