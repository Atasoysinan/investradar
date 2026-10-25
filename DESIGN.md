# InvestRadar design direction

Reference: Refero Styles — Mercury, Ramp, and the approved InvestRadar concept.
Purpose: a high-trust financial and geopolitical news dashboard for fast daily scanning.

## Typography

- Display and editorial headlines: Georgia, Times New Roman, serif. Use regular or medium weight, tight leading, never heavy geometric bold.
- Interface and reading text: Geist, Inter, system sans-serif.
- Market data: Geist Mono or a system monospace face for tabular alignment.

## Color roles

- Paper canvas: `#f4f1ea`
- White surface: `#fffdf8`
- Ink: `#111820`
- Muted ink: `#617080`
- Hairline: `#d9d7d0`
- Market canvas: `#0c171d`
- Market surface: `#122129`
- Electric blue action: `#1167ee`
- Positive: `#28d780`
- Negative: `#ff5a52`

## Layout

- Maximum desktop content width: 1520px.
- Desktop lead area is a three-part editorial grid: dominant visual lead, two supporting stories, concise daily brief.
- Major vertical rhythm: 24–32px. Card padding: 16–24px. Dense data surfaces use 12–16px.
- Use hairline borders and restrained radii. Avoid decorative shadows.
- Mobile preserves the same information hierarchy: lead story first, horizontally scrollable briefing cards second, compact Market Pulse third.

## Component rules

- Use blue only for actions, active states, and links.
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

