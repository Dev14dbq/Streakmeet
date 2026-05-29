# UI/UX Rules

## Product Feel

StreakMeet is mobile-first, dark, tactile, and social. Interfaces should feel fast and premium: glass surfaces, high contrast, rounded controls, and clear thumb-friendly actions.

## Layout

- Use `px-6` / 24px as the default page gutter.
- Keep primary content in a single focused column; cap wide overlays around `max-w-sm` to `max-w-md`.
- Prefer vertical spacing over divider-heavy layouts. Cards usually need 16px gaps and 20px internal padding.
- Keep bottom actions above safe areas with `pb-safe` or explicit `env(safe-area-inset-bottom)` padding.

## Buttons

- Use shared classes from `frontend/src/index.css`: `btn`, `btn--primary`, `btn--secondary`, `btn--soft`, `btn--ghost`, `btn--sm`, `btn--lg`, `btn--icon`, `btn--icon-lg`.
- Default buttons are `52px` high (`btn`). Primary form/CTA buttons are `56px` high (`btn btn--lg`).
- Small inline actions use `40px` height (`btn btn--sm`). Icon buttons use `44px` (`btn--icon`) or `52px` (`btn--icon-lg`).
- All action buttons are pill-shaped. Use rounded cards for containers, not for primary buttons.
- Primary means high-intent action only. Secondary is neutral surface. Soft is low-risk brand action. Ghost is text-like cancel/back.

## Inputs

- Use `field` for standard text inputs. It is 56px tall, pill-shaped, theme-aware, and has a brand focus ring.
- Inputs should use clear labels, even if visually hidden with `sr-only`.

## Color And Motion

- Use CSS variables from `frontend/src/index.css`; avoid new hardcoded colors unless the surface is camera/photo-specific.
- Keep active feedback subtle: scale around `0.96` for buttons, opacity for list items.
- Do not add heavy borders to glass cards; use blur, shadows, and spacing for separation.
