---
name: ui-design-craft
description: Professional UI design quality bar — visual hierarchy, spacing systems, typography, color and contrast, state coverage, responsive discipline, and motion restraint. Pairs with captured ui-style-* skills to raise the quality of any UI implementation.
whenToUse: Use whenever building, reviewing, or refining user interfaces — especially alongside a captured ui-style-* skill — to reach a professional standard of hierarchy, accessibility, states, and responsive behavior.
metadata:
  kind: ui-craft
  builtin: true
---

# UI Design Craft — Professional Quality Bar

This skill encodes the working discipline of a senior product designer. Apply it to every UI task. When a captured `ui-style-*` skill is also loaded, **its measured tokens win** — this skill governs everything the capture does not cover: hierarchy, states, accessibility, responsiveness, and taste.

## 1. Visual hierarchy

- One dominant element per view. Decide what the user must see first and make it unambiguous through size, weight, and position — not through more color.
- Limit each screen to 3 type roles (display/body/caption) and 2–3 weights. Every additional style must justify its existence.
- Group by proximity before boxes: related items belong together through spacing; reach for borders and cards only when spacing fails.
- Align to a grid. Nothing is placed "approximately" — edges line up with a column, a baseline, or another element.

## 2. Spacing system

- Build every gap, padding, and margin from one scale. If the source has no measured scale, use an 4px-base scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Internal padding relates to element size: small controls 8–12px, cards 16–24px, page sections 48–64px and up.
- White space is a feature. Dense, evenly-padded layouts read as cheap; generous, uneven-by-design spacing reads as premium.

## 3. Typography

- Body text: 14–16px, line-height 1.5–1.7, measure (line length) capped near 65–75 characters.
- Headings: line-height 1.1–1.3, tighter letter-spacing as size grows (large display type benefits from -0.02em).
- Never set text smaller than 12px; captions are 12–13px with muted color, not tiny high-contrast text.
- Use tabular numerals (`font-variant-numeric: tabular-nums`) for counters, metrics, and tables.

## 4. Color and contrast

- Text contrast meets WCAG AA: 4.5:1 for body, 3:1 for large text and essential icons. Check muted text especially — it is the first place contrast fails.
- Color carries meaning, not decoration: one brand/action hue, one danger hue, neutrals for everything else. Semantic colors stay consistent across the app.
- Never communicate by hue alone — pair color with icon, text, or shape for color-blind users.
- Surfaces separate through subtle luminance steps (2–5% lightness), not heavy borders.

## 5. State coverage — the professional differentiator

Every interactive element ships all states; every view ships all data phases:

- **Controls**: default, hover, active/pressed, focus-visible (a real ring, never `outline: none` alone), disabled, loading.
- **Views**: loading (skeletons over spinners for content areas), empty (helpful, with a next action), error (recoverable, with retry), success.
- **Forms**: inline validation on blur, summaries on submit, disabled submit while invalid-or-submitting, preserved input on failure.

A design that only exists in its happy-path state is unfinished.

## 6. Responsive discipline

- Design mobile-first, then enhance. Content order and priority must survive the smallest viewport.
- Use the captured breakpoints; without a capture, 640 / 768 / 1024 / 1280px.
- Touch targets ≥ 40×40px on coarse pointers; hover-only affordances need an alternative.
- No horizontal scrolling, no clipped text, no overlapping elements at any supported width — verify at the extremes, not the midpoint.

## 7. Motion restraint

- Animate to explain spatial changes (where did this come from / go to), never to decorate.
- Durations 150–300ms for UI transitions; ease-out for entrances, ease-in for exits. Nothing bounces unless the brand demands it.
- Honor `prefers-reduced-motion`: replace movement with opacity crossfades.

## 8. Anti-slop checklist — run before declaring done

- [ ] No gradient-purple-and-glassmorphism default "AI look" unless the captured style calls for it.
- [ ] No emojis as icons; use a consistent icon set at a consistent stroke weight.
- [ ] No centered wall of text: left-align body copy; center only short hero statements.
- [ ] Every number, date, and status is formatted for humans (1,024 / 2h ago / 68%).
- [ ] No placeholder rectangles shipping as "content": empty states are designed.
- [ ] Interactive elements have cursor, hover, and focus feedback.
- [ ] Text never overflows its container; long strings truncate or wrap deliberately.
- [ ] The page works at 320px and at 2560px.

## Conflict resolution

1. Captured `ui-style-*` tokens (colors, scale, radii, fonts) — the project's identity.
2. This skill's hierarchy/state/accessibility rules — professional quality.
3. The user's explicit instructions — always first when they contradict either.
