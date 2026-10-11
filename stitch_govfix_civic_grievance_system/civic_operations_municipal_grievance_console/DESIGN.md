---
name: Civic Operations & Municipal Grievance Console
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#374559'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f5d71'
  on-tertiary-container: '#c7d6ee'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d5e3fc'
  tertiary-fixed-dim: '#b9c7df'
  on-tertiary-fixed: '#0d1c2e'
  on-tertiary-fixed-variant: '#3a485b'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Public Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Public Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Public Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-id:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.01em
  code-timer:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes a high-accountability, calm, and institutional environment tailored for municipal operators, dispatchers, field supervisors, and civic leadership. The platform balances high operational density with cognitive ease, ensuring urgent grievances and municipal SLA commitments can be triaged without visual fatigue.

The aesthetic blends **Modern Institutional** and **Utilitarian SaaS**:
- **Tone:** Authoritative, impartial, lucid, and dependable.
- **Visual Tenor:** Pure structured utility—subtle 1px architectural dividers, deliberate contrast ratios exceeding WCAG AAA for core typography, and semantic color reservation strictly for status validation, SLA tracking, and resolution states.
- **Atmosphere:** Clean light-slate backdrops that minimize eye strain during extended dispatch shifts, crisp white actionable planes, and disciplined visual noise suppression.

## Colors

Color is applied functionally rather than ornamentally. Bright accents are strictly reserved for urgency tiers, routing classifications, and actionable civic workflows.

### Foundational Layers
- **App Canvas:** `#F8FAFC` (Slate 50) for outer frame and viewport background; `#F1F5F9` (Slate 100) for structural sidebars and muted column tracks.
- **Surfaces & Cards:** `#FFFFFF` (Pure White) with 1px structural borders at `#E2E8F0` (Slate 200).
- **Primary Typography:** `#0F172A` (Slate 900) for headers and data labels; `#334155` (Slate 700) for secondary details and body text.
- **Muted / Inactive Labels:** `#64748B` (Slate 500).

### Semantic and Operational Accents
- **Municipal Primary Action:** `#1D4ED8` (Blue 700) with interactive hover `#2563EB` (Blue 600). Soft tint `#EFF6FF` (Blue 50) for active navigation states.
- **SLA Warning / Escalation Caution:** `#D97706` (Amber 600) on `#FFFBEB` (Amber 50) tint.
- **SLA Breach / Critical Hazard:** `#DC2626` (Red 600) on `#FEF2F2` (Red 50) tint.
- **Verified Completion / Resolved:** `#059669` (Emerald 600) on `#ECFDF5` (Emerald 50) tint.
- **Queue / In Triage:** `#4F46E5` (Indigo 600) on `#EEF2FF` (Indigo 50) tint.

## Typography

The typography leverages **Public Sans** for all narrative and structural interfaces, providing governmental authority, robust glyph geometry, and supreme legibility at small sizes. 

For civic accountability data—such as ticket tracking identifiers (e.g., `TK-84920`), GIS spatial coordinates, SLA countdown timers, and financial restitution metrics—**JetBrains Mono** provides fixed-width alignment and zero-ambiguity character differentiation (slashed zeros, clear numeral distinction). All standard numbers in Public Sans utilize OpenType tabular figures (`tnum`) across dense data tables to preserve vertical alignment.

## Layout & Spacing

The layout is built upon an architectural grid calibrated for high-density command consoles and responsive field inspections:
- **Desktop (1280px+):** 12-column fluid grid inside an application frame with a fixed 240px collateral navigation rail. Gutters are 16px (`gutter`), section margins 24px–32px.
- **Tablet (768px - 1279px):** 8-column layout. Side navigation collapses to an icon rail (64px). Gutters set to 16px.
- **Mobile (<768px):** 4-column layout with 16px outer safety margins. Triage tables fold into card stacks with sticky SLA headers.

Spacing rhythm relies on a compact 4px baseline unit. Component interior padding ranges tightly between `0.5rem` (`space-sm`) and `1rem` (`space-lg`) to balance screen real estate across data-heavy operational queues.

## Elevation & Depth

This design system avoids theatrical drop shadows, relying on **tonal contrast and precision borders** to communicate hierarchy:

- **Surface Grounding:** The `#F8FAFC` canvas supports elevated `#FFFFFF` cards, drawers, and panels separated by crisp, 1px `#E2E8F0` hairline borders.
- **Low-Elevation Resting State:** Cards and data containers use a subtle ambient feather: `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Active / Drag / Floating State (Modals, Popovers, Flyout Drawers):** `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)` combined with a 1px border (`#CBD5E1`).
- **Surface Nesting:** Nested zones inside ticket detail drawers (e.g., audit trails, internal dispatch notes) use `#F1F5F9` surfaces without additional shadows.

## Shapes

The system implements a disciplined, understated geometry using **Soft (Level 1)** rounding:
- Standard interactive elements (inputs, dropdowns, buttons, list rows): `0.25rem` (4px).
- Containers, modal dialogs, and persistent operational cards: `0.5rem` (8px).
- Badges and status pills: `0.25rem` (4px) with structural borders to maintain a professional, administrative feel instead of overly consumer-oriented pill contours.

## Components

### Buttons
- **Primary:** Background `#1D4ED8`, text `#FFFFFF`, border `transparent`, height 36px, horizontal padding 14px. Focus state: 2px ring `#2563EB` with 2px white offset.
- **Secondary / Operational:** Background `#FFFFFF`, text `#0F172A`, border 1px solid `#E2E8F0`, hover background `#F8FAFC`.
- **Destructive:** Background `#DC2626`, text `#FFFFFF`, hover `#B91C1C`.

### Status Badges & SLA Indicators
- Constructed using `code-timer` or `label-sm` font tokens.
- **SLA Breach / Urgent:** Text `#991B1B`, background `#FEF2F2`, border 1px solid `#FCA5A5`.
- **SLA Warning:** Text `#92400E`, background `#FFFBEB`, border 1px solid `#FCD34D`.
- **Resolved / Closed:** Text `#065F46`, background `#ECFDF5`, border 1px solid `#6EE7B7`.
- **Triage / Queue:** Text `#3730A3`, background `#EEF2FF`, border 1px solid `#C7D2FE`.

### Form Controls & Inputs
- Height 36px, typography `body-md`. Background `#FFFFFF`, border 1px solid `#CBD5E1`.
- Focus: Border `#1D4ED8`, outline 2px solid `#DBEAFE`.
- Placeholder: `#94A3B8`.

### Data Grid & List Rows
- Row height: 44px (compact) or 52px (standard).
- Top/bottom border 1px solid `#E2E8F0`. Hover row state: `#F8FAFC`.
- Ticket ID cell uses `code-id` typography with `#0F172A`.

### Context & Policy Utility Components
- **Demo Mode Banner:** Static top bar or corner element with background `#0F172A`, foreground `#F8FAFC`, paired with a 1px amber border badge reading `SIMULATION / POLICY SANDBOX`.
- **Role Indicator:** Persistent badge anchored to the primary header displaying operational authorization scope (`DISPATCHER LEVEL II`, `MUNICIPAL SUPERVISOR`) set in `label-sm` with a discrete dot status indicator.