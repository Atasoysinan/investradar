# InvestRadar design direction

Reference: the supplied Ramp and Mercury `DESIGN.md` files plus the approved InvestRadar concept image.
Purpose: a high-trust financial and geopolitical news dashboard for fast daily scanning.

Composition: 70% Ramp structure, 20% Mercury data surfaces, 10% InvestRadar brand identity.

## Typography

- Display, editorial, and interface text: Geist/Inter/system sans-serif at regular weight. Hierarchy comes from size and tight leading, following Ramp's Lausanne substitute guidance.
- Mercury's restrained 480-weight display character may be approximated with medium weight only inside dark data surfaces.
- Market data: Geist Mono or a system monospace face for tabular alignment.

## Color roles

- Bone canvas: `#f4f2f0`
- Paper surface: `#ffffff`
- Ink: `#0c0a08`
- Muted ink: `#6d6c6b`
- Hairline: `#e5e7eb`
- Mercury market canvas: `#171721`
- Mercury market surface: `#1e1e2a`
- Ramp action: `#e4f222`
- InvestRadar brand blue: `#1167ee`
- Positive: `#28d780`
- Negative: `#ff5a52`

## Layout

- Maximum desktop content width: 1200px.
- Desktop lead area is a three-part editorial grid: dominant visual lead, two supporting stories, concise daily brief.
- Major vertical rhythm: 16–24px above the fold; later editorial sections may use 64px separation. Card padding: 20–24px. Dense data surfaces use 12–16px.
- Light cards use 16px radius plus hairline borders. Dark Mercury cards use 12px radius and tonal separation. Never use drop shadows.
- Mobile preserves the same information hierarchy: lead story first, horizontally scrollable briefing cards second, compact Market Pulse third.

## Component rules

- Use chartreuse only for the primary conversion action and genuinely live signals.
- Use InvestRadar blue sparingly for the wordmark, editorial links, and category labels.
- Use green/red only for verified market direction.
- Show `LIVE` only when the underlying item explicitly reports a live state.
- Never fabricate charts, prices, percentages, or timestamps.
- The header contains the only primary navigation. Do not add a duplicate bottom navigation.
- News imagery must support the article and keep a strong editorial crop.

## Do not

- Do not use emoji as section icons.
- Do not add glassmorphism, gradients, or large shadows.
- Do not turn the page into a generic admin dashboard.
- Do not fill missing data with invented market values.

