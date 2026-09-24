# First-run design QA

final result: passed

## Comparison

- Source: the user-supplied screenshots `01-1000039657.png` (intro), `02-1000039658.png` (notifications), and `03-1000039659.png` (ready). The source images include simulated iOS chrome, a blue character, and controls for features this Web app does not currently deliver.
- Rendered: [PR #106 Deploy Preview](https://deploy-preview-106--catchwords.netlify.app/), with direct fixtures `/?step=notifications`, `/?step=ready`, `/?step=home`, and `/?step=dex`. The implementation was visually captured as a 460 × 900 CSS pixel center crop; the source is a higher density phone mockup. The comparisons use the content inside the screen, excluding device chrome and preview labels.

## Findings and iteration

- **P2, intro photo balance — fixed.** The first rendered 3-photo group was too small and the cat card obscured the coffee label. Increased the group height and moved the smaller cat card beneath the coffee card. The final preview shows all three images and readable labels above the CTA.
- **P2, copy/feature promise — fixed.** The notifications page could imply scheduled delivery already existed. The final copy says preferences are saved on sign-up and scheduled reminders are in preparation.
- **P3, accepted differences.** The exact cafe, flowers, cat, and seaside photo subjects differ from the reference; each is an individually generated photograph with the same bright lifestyle direction. The existing square app icon is used for brand consistency. The blue character and weekly report have been omitted as requested or unsupported. The preview alone shows a sample-state banner above the app.

## Fidelity checks

| Surface | Result |
| --- | --- |
| Typography | Dark navy Japanese headings, restrained gray descriptions, and blue CTAs preserve the mockup hierarchy; line breaks stay readable in the narrow screen. |
| Layout and spacing | Intro photos now have a balanced overlapping arrangement. Notification choices have consistent left icons and right toggles; the ready photo is centered with space for the bottom CTA. |
| Color and tokens | White and pale-blue background, bright blue emphasis, subtle card outlines and shadows match the supplied direction. |
| Imagery | Generated photo assets load sharply in the introduction, ready screen, Home album, and sample Dex. Actual captures replace the sample content after the first Catch. |
| Copy and behavior | Japanese text explains each step in ordinary terms; sample albums are labeled. Intro → five questions → notifications → ready → guided Home and Dex was exercised in the Deploy Preview. The user cannot enter account creation before the real first word is saved to the Dex. |

No remaining P0/P1/P2 design findings in the compared states. Scheduled reminder delivery and device notification permissions are separate future product work; this page stores preferences only.
