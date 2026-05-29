---
name: Vivid Pulse
colors:
  surface: '#121317'
  surface-dim: '#121317'
  surface-bright: '#38393d'
  surface-container-lowest: '#0d0e12'
  surface-container-low: '#1a1b1f'
  surface-container: '#1e1f23'
  surface-container-high: '#292a2e'
  surface-container-highest: '#343539'
  on-surface: '#e3e2e7'
  on-surface-variant: '#e7bcbd'
  inverse-surface: '#e3e2e7'
  inverse-on-surface: '#2f3034'
  outline: '#ae8788'
  outline-variant: '#5e3f40'
  surface-tint: '#ffb3b5'
  primary: '#ffb3b5'
  on-primary: '#680019'
  primary-container: '#ff5167'
  on-primary-container: '#5b0015'
  inverse-primary: '#be0036'
  secondary: '#c8c6c8'
  on-secondary: '#303032'
  secondary-container: '#474649'
  on-secondary-container: '#b6b4b7'
  tertiary: '#c6c6c6'
  on-tertiary: '#303030'
  tertiary-container: '#919191'
  on-tertiary-container: '#2a2a2a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b5'
  on-primary-fixed: '#40000c'
  on-primary-fixed-variant: '#920027'
  secondary-fixed: '#e4e2e4'
  secondary-fixed-dim: '#c8c6c8'
  on-secondary-fixed: '#1b1b1d'
  on-secondary-fixed-variant: '#474649'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1b1b1b'
  on-tertiary-fixed-variant: '#474747'
  background: '#121317'
  on-background: '#e3e2e7'
  surface-variant: '#343539'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  cta:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  safe-margin: 24px
  gutter: 16px
  element-gap: 12px
  section-padding: 32px
---

## Brand & Style

The design system is engineered for high-energy social interaction, blending the immersive depth of glassmorphism with the high-contrast impact of a true dark mode. It targets a Gen-Z demographic that values speed, aesthetic "vibes," and premium tactile feedback. The UI should feel like a high-end night-mode interface: sleek, mysterious, and hyper-responsive.

The aesthetic style is **Glassmorphism meets TikTok-Dark**. By utilizing a pitch-black foundation (#000000), elements appear to float in a void, separated only by luminosity and blur rather than structural borders. The emotional response is one of exclusivity and modern sophistication, echoing the fluid navigation of iOS-native applications.

## Colors

The palette is built on a foundation of absolute black to maximize OLED efficiency and visual pop.

- **Primary (#FF1A4F):** A vibrant crimson used for high-intent actions, active states, and brand signatures. It must "glow" against the dark background.
- **Surface (rgba(28, 28, 30, 0.8)):** The standard container color for cards and panels, always paired with a `backdrop-filter: blur(20px)` to create the signature glass effect.
- **Background (#000000):** The base canvas for the entire application.
- **Text:** Primary text is Pure White (#FFFFFF), Secondary text is a muted Gray (#8E8E93).

## Typography

The typography uses **Inter** to mimic the system-level feel of SF Pro. The hierarchy relies on extreme weight variance—using Heavy (800) and Bold (700) weights for headlines to create a sense of urgency and impact similar to modern social media content feeds. Body text remains clean and highly legible. All headings should utilize tighter letter-spacing to maintain a compact, "editorial" look.

## Layout & Spacing

This design system utilizes a **fluid grid** with generous safe areas.

- **Margins:** A consistent 24px horizontal margin is required for all primary content to ensure an airy, premium feel.
- **Stacking:** Vertical spacing between cards should be 16px.
- **Mobile-First:** The layout is optimized for thumb-driven navigation. All interactive elements must sit within the "natural" reach zone, emphasizing a bottom-heavy layout hierarchy.
- **Breakpoints:** On larger devices, content is capped at a 600px max-width to maintain the focused "feed" experience, centering the column on the screen.

## Elevation & Depth

Depth is created through **translucency and blurs** rather than traditional elevation scales.

1.  **Level 0 (Base):** #000000 background.
2.  **Level 1 (Cards):** rgba(28, 28, 30, 0.8) with 20px blur. No border. Soft `drop-shadow(0 10px 30px rgba(0,0,0,0.5))`.
3.  **Level 2 (Modals/Overlays):** rgba(44, 44, 46, 0.9) with 30px blur.
4.  **Floating Navigation:** The bottom tab bar uses a high-intensity glass effect with a subtle top-inner-glow (white at 0.05 opacity) to separate it from the content passing beneath it.

## Shapes

The shape language is defined by extreme roundness, mimicking hardware industrial design (like the corners of an iPhone).

- **Pills:** All buttons, chips, and input fields must use a fully rounded radius (`rounded-full`) to emphasize the social/friendly nature of the app.
- **Containers:** Content cards and bottom sheets use a `3xl` radius (24px).
- **Avatars:** Strictly circular with a 2px inner-glow in the primary color if the user has an active "streak."

## Components

- **Buttons:** Use the shared classes in `frontend/src/index.css`. Base buttons use `btn` at 52px height, main CTAs use `btn btn--lg` at 56px, inline actions use `btn btn--sm` at 40px, and icon actions use `btn--icon` (44px) or `btn--icon-lg` (52px). Primary buttons are Solid #FF1A4F with white text. Secondary buttons are the "Glass" style (translucent gray) with white text. No borders allowed for primary CTAs.
- **Floating Tab Bar:** A pill-shaped floating element docked 20px from the bottom. It uses the frosted glass effect. Icons glow slightly when active.
- **Input Fields:** Semi-transparent dark gray backgrounds, `rounded-full`, with 24px horizontal padding. The cursor and selection highlight must use the Primary Crimson.
- **Cards:** Use the `rounded-3xl` (24px) corners. Content within cards should have 20px of internal padding.
- **Streaks/Chips:** Small `rounded-full` badges. When active, they should utilize a subtle pulse animation or a linear gradient using the Primary color.
- **Lists:** Clean separation using vertical space (12px-16px) instead of dividers. Interactive list items should have a "pressed" state that reduces opacity to 0.7.
