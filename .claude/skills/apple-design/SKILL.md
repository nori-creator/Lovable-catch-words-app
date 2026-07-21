---
name: apple-design
description: Apple's Human Interface Guidelines translated for the web — the full HIG, not just motion. Use when building or reviewing any screen, component, layout, color, type, icon, navigation, search, form, feedback, empty/loading/error state, translucent material, gesture, spring animation, generative-AI/assistant UX, accessibility (VoiceOver/contrast/Dynamic Type/reduced-motion), or platform-adaptive behavior. The reasoning framework (6 layers, top-down) and the evaluation principles (Clarity, Deference, Depth; Value & Focus; Freedom & Recovery; Familiarity; Immediate Feedback) apply to every design decision in this app.
---

# Apple Design (Human Interface Guidelines)

This skill is a working translation of **Apple's Human Interface Guidelines** — its structure, its principles, and its component-level rules — into this web app (React, Tailwind, CSS, Pointer Events, spring libraries). It also keeps the deep *Designing Fluid Interfaces* motion craft, because motion is where the HIG's "immediate feedback" and "depth" principles become real.

Use it two ways:
1. **Top-down, when designing** — reason down the six layers (below) so every choice is anchored to intent, not decoration.
2. **As an evaluation checklist, when reviewing** — score any screen against the core principles and the component rules.

> The goal, in Apple's words: *"When we align the interface to the way we think and move, it stops feeling like a computer and starts feeling like a seamless extension of us."* Everything here serves that.

---

## Part I — The reasoning framework

### The six layers (reason top-down)

The HIG is organized as a hierarchy. Design in this order; never start at the component layer.

1. **Platforms** — the context of use. This app is a *mobile-first web app* used one-handed, in the world (scanning signs, on the go), in variable light. Optimize for glanceability, thumb reach, and interruption.
2. **Foundations** — the non-negotiable substrate: layout & safe areas, color, typography, iconography, accessibility, writing. Get these right and most screens are already 80% good.
3. **Patterns** — recurring user goals: navigation, search, onboarding, feedback, loading, entering data, modality, undo. Pick the established pattern before inventing.
4. **Components** — the concrete UI: buttons, tab bars, sheets, lists, fields, cards. Compose from a consistent set.
5. **Inputs** — how people drive it: touch (primary), pointer, keyboard, voice, camera. Design the input path first (see motion craft, Part IV).
6. **Technologies** — platform capabilities to fold in: generative AI / assistant UX, TTS, camera, maps, notifications.

### Three lenses (the classic triad)

Every screen must pass all three:

- **Clarity.** Text legible at every size; icons precise; adornment subordinate to function; a sharp focus on what matters. Negative space, color, and type create hierarchy — the most important thing is the most obvious.
- **Deference.** The UI defers to the content. Fluid motion and translucency help without competing. No unnecessary chrome, no gratuitous decoration stealing attention from the user's words, photos, and map.
- **Depth.** Distinct visual layers and realistic motion convey hierarchy, impart vitality, and aid understanding — a sheet sits *above* content, a scan overlay sits *above* the camera. Depth is meaning, not ornament.

### The evaluation principles (score against these)

| Principle | Question to ask of every screen |
| --- | --- |
| **Value & Focus** | Does this earn the user's time, attention, and trust? What did we choose *not* to build here? |
| **Freedom & Recovery** | Can the user explore without fear? Is every slip trivially undoable? Are confirmations reserved for the genuinely destructive? |
| **Familiarity** | Does it behave the way people already expect (metaphors, standard positions, standard gestures)? If it breaks a convention, can we prove it's better? |
| **Immediate Feedback** | Does every action produce an instant, legible, proportionate response — on press, during, and at completion? |
| **Consistency** | Do same-looking things behave the same and live in the same place across the app? |

If a design fails one of these, fix that before polishing pixels.

---

## Part II — Foundations

### 1. Layout, safe areas, reading order

- **Respect safe areas.** Never let interactive content hide under the notch, home indicator, or a floating tab bar. Use `env(safe-area-inset-*)` and pad the bottom nav and sheets accordingly.
- **Thumb-first.** Primary actions live in the bottom third, within one-handed reach. Destructive or rare actions go up top or behind a menu.
- **Reading order = source order.** Lay out top-to-bottom, leading-to-trailing, so screen readers and keyboard tab order match the visual flow. Don't reorder visually with CSS in a way that desyncs from DOM order.
- **Fluid, not fixed.** Size with `rem`/`%`/`min()`/`max()`/`clamp()` and flex/grid so layouts survive Dynamic Type, rotation, and every viewport. A layout that breaks when text grows is a bug.
- **Consistent margins and a clear grid.** Align to a shared spacing scale; nothing is placed by eye.

### 2. Color

- **Ship four variants of every color: light, dark, high-contrast light, high-contrast dark.** In CSS this is `@media (prefers-color-scheme)` × `@media (prefers-contrast: more)`. Define semantic tokens (`--surface`, `--label`, `--label-secondary`, `--accent`) and resolve them per variant — never hard-code a hex in a component.
- **Never encode meaning with color alone.** A color-blind user must get the same information. Pair color with an icon, label, shape, or position. (Scan markers: don't rely on emerald/amber/white alone — back them with shape or a legend label.)
- **Contrast is a hard floor:** **4.5:1 for body text, 3:1 for large text (≥ ~24px or ≥ ~19px bold) and for meaningful UI glyphs/controls.** Verify, don't eyeball. Secondary/tertiary label colors still must clear the floor against their actual background.
- **Semantic system colors adapt.** Use red for destructive, green for success, etc., consistently — but always with a non-color cue too.
- **Test on real content and both themes** before shipping a color.

### 3. Typography

(From *The Details of UI Typography* + HIG type foundations.)

- **Default to the system font** (`system-ui`) — it ships optical sizing, tracking tables, and legibility tuning for free. Override only with a defensible reason.
- **Support Dynamic Type.** Respect the user's text-size preference; scale layout *with* the text (spacing in `rem`/`em`). Nothing clips or overlaps at the largest setting.
- **Tracking (letter-spacing) is size-specific — never one value for all sizes.** Large display text wants *negative* tracking; small text wants slightly *positive*. Tighten headings (`-0.02em`), keep body near `0`.
- **Leading (line-height) tracks size inversely.** Tight on large headings (~1.05), looser on body (~1.5).
- **Hierarchy from weight + size + leading as a set,** not size alone. Weight adds emphasis without taking space.
- **Minimum comfortable body size; never below legibility.** Don't shrink text to fit — reflow instead.

```css
:root { font: 100%/1.5 system-ui, sans-serif; }
.display {
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-optical-sizing: auto;
}
```

### 4. Iconography & app icon

- **Icons are precise, simple, recognizable, and consistent in weight and metaphor.** Use a single icon family; don't mix stroke weights or corner radii.
- **Every meaningful icon has a text label or an accessible name.** Icon-only controls must carry `aria-label`.
- **App icon: design in layers, bake in nothing.** Provide a clean, layered mark; let the platform apply material, shadow, highlight, and shape. Never paint on your own drop shadow, gloss, or rounded-rect mask — the system does that (and does it as Liquid Glass on modern OSes).

### 5. Writing (UX writing is design)

- **Plain, specific, concise.** No jargon. Say what a control does.
- **Direct, specific labels beat safe generic ones.** Name nav items for their contents ("図鑑", "地図", "スキャン"), not vague umbrellas.
- **Consistent terminology.** One name per concept across the whole app.

---

## Part III — Patterns

### 6. Navigation

- **Match structure to content:** flat (tab bar) for peer sections, hierarchical (drill-down with a clear back path) within a section. This app uses a **5-tab bottom bar** for its top-level peers — keep it stable and predictable.
- **Always answer four questions on every screen:** Where am I? Where can I go? What's here? How do I get out? **Never trap the user** — every modal has an obvious dismiss.
- **Preserve state and position** when navigating back. Returning to a list should restore scroll position.
- **Standard gestures work:** swipe-back, swipe-to-dismiss a sheet. Don't override them with custom handlers that break muscle memory.

### 7. Search

- **Make search reachable and obvious** where users expect to look something up. This app puts an **always-on native/target search field** on the scan screen — don't bury it behind a button.
- **Give immediate, incremental feedback** as the query changes; show clear empty and no-results states with a next action.
- **Be forgiving** — tolerate case, spacing, and near-misses.

### 8. Feedback, status, loading, empty & error states

- **Four kinds of feedback:** status, completion, warning, error. Confirm meaningful actions, expose ongoing status, warn before problems, validate inline (not only on submit).
- **Loading is communication, not a spinner dump.** Show what's happening ("AIが分析中"), and prefer determinate progress or content skeletons over an endless spinner. A process that "spins forever" with no terminal state is a defect.
- **Empty states teach.** An empty 図鑑 explains what will fill it and how to start.
- **Errors are recoverable and plain.** Say what happened and what to do next, in the user's language; never surface a raw stack trace or an HTTP code (e.g. a 402 becomes a friendly, actionable message).

### 9. Entering data (forms)

- **Ask for the least.** Pre-fill and infer where you can; don't make people type what the app already knows.
- **Right input for the type** (numeric keypad for numbers, correct `inputmode`/`autocomplete`), inline validation, and clear required-vs-optional.
- **Never lose the user's input** on error — repopulate.

### 10. Modality & undo

- **Use modality sparingly** — only when focus genuinely must be captured. Prefer non-blocking, inline flows.
- **Every modal task is escapable** (cancel + swipe-down) and states the cost of leaving if there's unsaved work.
- **Design for Freedom & Recovery:** easy, forgiving undo for slips; a confirmation dialog *only* for genuinely destructive, irreversible actions. Overusing confirmations trains people to click through them.

---

## Part IV — Components & inputs (touch-first)

### 11. Hit targets, buttons, and prominence

- **Minimum 44×44 pt (≈44px) tap target for every interactive element** (60pt on visionOS-class spatial input). Pad small-looking controls up to the floor with invisible hit area; keep ~8px between adjacent targets.
- **At most one — occasionally two — prominent (filled/accent) buttons per view.** Everything else is secondary/plain. Too many "primary" buttons means none reads as primary.
- **A destructive action is never the prominent button.** Style it with the destructive (red) role, place it away from the confirm, and require intent for the irreversible.
- **Feedback on press, instantly** (see §16). A button that only reacts on release feels dead.

### 12. Lists, cards, sheets

- **Lists:** clear row hierarchy, adequate touch height, trailing accessory (chevron / control) where it acts. Right-align a per-row action (e.g. the pronunciation button) so the thumb finds it.
- **Sheets (vaul/Drawer):** drag-to-dismiss with momentum projection; a translucent material above a dimming scrim for a focused task, or an offset non-blocking panel *without* a scrim for a parallel one. Round the top corners; respect the bottom safe area.
- **Cards** group related content; keep internal padding and radius consistent across the app.

---

## Part V — Materials, depth & motion (the craft)

This is where Deference, Depth, and Immediate Feedback are won or lost. Springs are the core tool: they are inherently interruptible and velocity-aware.

### 13. Liquid Glass & translucent materials

Apple's modern material is **Liquid Glass** — a dynamic, translucent layer that refracts and reflects its surroundings. On the web, approximate with `backdrop-filter`, and follow the discipline that keeps it legible:

- **Glass is for the transient functional layer only** — navigation, toolbars, sheets, popovers, controls that float *above* content. **Never build the content layer itself out of glass.** If everything is glass, nothing reads as elevated.
- **Content scrolls under translucent chrome** — build nav/tab bars/sheets as `backdrop-filter: blur()` + a semi-transparent background, not opaque strips.
- **Never stack a light translucent surface directly on another** — legibility collapses. One glass layer over solid content.
- **Keep foreground content vivid.** Text and glyphs over glass need higher contrast, slightly heavier weight, and a small tracking bump — never flat mid-gray. Put color on a solid layer, not the translucent foreground. (Avoid the equivalent of Apple's "no quaternary fill on thin material" — don't put your faintest tint on your thinnest glass.)
- **Material weight encodes hierarchy:** heavier/darker material separates structural regions; lighter draws the eye to interactive elements. Bigger surfaces read thicker — stronger blur + deeper shadow.
- **Scroll edge effects, not hard dividers** — fade a small blur/gradient mask where content meets floating chrome, only where they actually overlap.
- **Materialize, don't just fade.** Animate blur radius + scale together on enter/exit so glass arrives like a real material.
- **Dim to focus, separate to keep flow.** Modal task → scrim + push background back. Parallel panel → translucency + offset, no scrim.

```css
.toolbar {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.4); /* bright top edge = light on the material */
}
@media (prefers-reduced-transparency: reduce) {
  .toolbar { background: white; backdrop-filter: none; }
}
```

### 14. Response — kill latency

Response is the foundation of Immediate Feedback. Lag makes directness "fall off a cliff."

- **Respond on pointer-down, not on release.** Highlight the instant a control is pressed.
- **Audit every latency** — debounces, artificial timers, transition waits, the ~300ms tap delay.
- **Feedback is continuous *during* the interaction** — a drag/slider/drawer updates 1:1 with the pointer the whole way, not only at the end.

```css
.button:active { transform: scale(0.97); transition: transform 100ms ease-out; }
```

### 15. Direct manipulation — 1:1 tracking

- Dragged content stays glued to the finger and respects the **grab offset** (don't snap to center on grab).
- Use Pointer Events + `setPointerCapture` so tracking survives leaving the element's bounds.
- Keep a short **velocity/position history** (last few `pointermove`s) — you'll need release velocity.

### 16. Interruptibility — the single most important motion principle

Every animation must be interruptible and redirectable at any instant. A closing sheet the user grabs again follows the finger — it doesn't finish closing first.

- **Never lock out input during a transition.**
- **Animate from the presentation (live on-screen) value, never the target** — reading the target causes a visible jump on interrupt.
- **Avoid CSS transitions/`@keyframes` for gesture-driven motion** — they can't be grabbed and reversed mid-flight. Springs start from the current value by default.
- **Blend velocity on reversal** — don't hard-cut (a velocity discontinuity is a "brick wall"). Choose a spring lib that re-targets from current velocity.
- **Decompose 2D motion into independent X/Y springs.**

### 17. Springs — behavior over prescribed animation

Think in two designer parameters, not mass/stiffness/damping:

- **Damping ratio** — overshoot. `1.0` = critically damped (smooth settle, no bounce); `<1.0` bounces.
- **Response** — how fast it reaches target, in seconds (not a fixed duration).

**Defaults:** start most UI at **damping `1.0`**; add bounce (**~`0.8`**) **only when the gesture carried momentum** (a flick/throw/drag-release).

| Interaction | Damping | Response |
| --- | --- | --- |
| Move / reposition | `1.0` | `0.4` |
| Rotation | `0.8` | `0.4` |
| Drawer / sheet | `0.8` | `0.3` |

```js
import { animate } from 'motion';
animate(el, { y: 0 },      { type: 'spring', bounce: 0,   duration: 0.4 }); // default
animate(el, { y: target }, { type: 'spring', bounce: 0.2, duration: 0.4 }); // after a flick
```

### 18. Velocity handoff & momentum projection

- **Velocity handoff:** when a gesture ends, the animation continues at the finger's exact velocity — no seam. Pass release velocity as the spring's initial velocity (normalize by remaining distance if the API wants relative velocity: `gestureVelocity / (target − current)`).
- **Momentum projection:** don't snap from the release point — project where the flick is *going*, then snap to the nearest target to that projected point.

```js
function project(v /* px/s */, decel = 0.998) { return (v / 1000) * decel / (1 - decel); }
const target = nearestSnapPoint(currentPosition + project(releaseVelocity));
animateSpringTo(target, { velocity: releaseVelocity });
```

### 19. Spatial consistency, hinting, rubber-banding

- **Enter and exit along the same path**; a right-in panel dismisses right.
- **Anchor to the source** — set `transform-origin` to the triggering element so menus/popovers/sheets grow from what opened them.
- **Hint in the gesture's direction** — intermediate frames telegraph the outcome.
- **Rubber-band at edges** — progressive resistance, never a hard stop.

```js
function rubberband(overshoot, dim, k = 0.55) {
  return (overshoot * dim * k) / (dim + k * Math.abs(overshoot));
}
```

### 20. Multimodal feedback & frame-level smoothness

- **Causality, harmony, utility:** feedback fires on the causal event, the visual + sound + haptic land on the *same frame*, and you add it only where it earns its place (success/error/commit/snap).
- Animate compositor-friendly props (`transform`, `opacity`), hint with `will-change`, drive with `requestAnimationFrame`. For very fast motion a subtle blur/stretch reads better than a sharp streak.

---

## Part VI — Accessibility (non-optional)

Accessibility is a Foundation, not a feature. Build it into every component.

- **VoiceOver / screen readers:** every control has an accessible name and role; icon-only buttons carry `aria-label`; decorative images are hidden; state (selected/expanded/loading) is announced. DOM order = reading order.
- **Contrast:** meet the 4.5:1 / 3:1 floors (§2). Support `prefers-contrast: more` with near-solid backgrounds and defined borders.
- **Dynamic Type:** layout scales with text (§3); nothing clips at max size.
- **Never color-only** (§2).
- **Reduced motion:** honor `prefers-reduced-motion: reduce` — replace slides/springs/parallax with short opacity cross-fades; drop overshoot; keep comprehension-aiding opacity/color changes. Also honor `prefers-reduced-transparency: reduce` (frost/solidify glass).
- **Touch targets ≥ 44px** (§11) — a motor-accessibility floor, not just a comfort one.
- Avoid full-viewport moving backgrounds, ~0.2 Hz oscillations, and abrupt brightness jumps (ease theme changes).

```css
@media (prefers-reduced-motion: reduce) {
  .sheet { transition: opacity 200ms ease; transform: none !important; }
}
```

---

## Part VII — Generative AI & assistant UX (this app scans, enriches, pronounces)

The app's AI features (word enrichment, scan analysis, TTS, issue auto-fix) are user-facing and must follow Apple's guidance for intelligent/generative experiences.

### 21. Responsible AI — four commitments

1. **Control.** The user stays in charge. AI *proposes*; the user disposes. Offer a way to edit, dismiss, regenerate, or report a bad result (this app's per-word "間違い報告" button). Never take an irreversible action from an AI result without confirmation.
2. **Inclusion.** Results must work across the user's languages and contexts; don't assume one locale. Avoid outputs that could mislead a learner (a language app must not teach a wrong reading or an unsafe usage).
3. **Transparency.** Make it clear when content is AI-generated and that it can be imperfect. Set expectations; label generated fields. Don't present a guess as authoritative — prefer verified dictionary data first, AI as enrichment.
4. **Graceful fallback.** AI *will* fail or be unavailable (offline, quota, 402). Always degrade to something useful — cached/verified data, the on-device voice for TTS, a plain error with a retry — never a dead spinner or a raw error code.

### 22. Feedback loops & quality

- **Explicit feedback** (the report/thumbs button) and **implicit feedback** (accept/edit/ignore) both improve the system — capture them (this app logs `ai_runs`).
- **Latency is UX.** For the scan path, meaning + pronunciation must appear *fast and accurate* — prefer pre-cached, verified dictionary audio (zero round-trip) over a live synth on the hot path; accuracy wins ties.
- **Evaluate before shipping** prompt/model changes against real examples; don't regress the common case to fix an edge case.

---

## Part VIII — Platform & input adaptation

- **Adapt, don't port.** Honor the conventions of the surface you're on: on touch, big tap targets and gestures; on pointer, hover affordances and precise controls; on keyboard, full tab/shortcut support. This app is touch-first but must stay usable with a mouse and keyboard.
- **Mirror for RTL** — layout, icons with direction, and reading order flip in right-to-left locales; don't hard-code left/right (use logical properties: `margin-inline-start`, etc.).
- **Camera & capture minimalism** — the scan/capture UI stays out of the way: a clean viewfinder, controls at the edges, the content (the sign, the frame) front and center. A calm "分析中" overlay, not a busy effect competing with the camera.
- **Respect the environment** — one-handed, glanceable, interruptible; assume variable light and short attention.

---

## Process

- **Prototype interactively** — a working demo is worth "a million static designs"; you discover the interface by playing with it.
- **Design interaction and visuals together** — "you shouldn't be able to tell where one ends and the other begins."
- **Test with real people in real context**, and review motion frame-by-frame to catch what's invisible at speed.

---

## Quick Reference

| Layer | Rule | Concrete value |
| --- | --- | --- |
| Foundation · color | Four variants, contrast floor | `4.5:1` body / `3:1` large; never color-only |
| Foundation · type | System font, size-specific tracking | tighten large (`-0.02em`), body `~0`; Dynamic Type |
| Foundation · icon | Layered app icon, no baked effects | system applies material/shadow/shape |
| Component · target | Minimum hit area | `44×44` px (60 spatial), ~8px apart |
| Component · button | Prominence budget | ≤1–2 prominent; destructive never prominent |
| Material | Glass = transient layer only | `backdrop-filter`, content scrolls under, no glass-on-glass |
| Motion · default spring | Critically damped | `damping 1.0`, `response 0.3–0.4` |
| Motion · momentum spring | Slight bounce, only after a flick | `damping ~0.8`, `response 0.3–0.4` |
| Motion · interrupt | Animate from live value | read on-screen transform |
| Motion · flick landing | Project momentum | `current + (v/1000)·d/(1−d)`, `d≈0.998` |
| Feedback | On pointer-down, continuous | never only at the end |
| A11y | VoiceOver name + reduced-motion + contrast | `aria-label`, `prefers-reduced-motion`, floors |
| AI UX | Control · Inclusion · Transparency · Fallback | editable, labeled, degrades to verified/cached |
| Pattern · recovery | Undo for slips, confirm only destructive | no spinner with no terminal state |
