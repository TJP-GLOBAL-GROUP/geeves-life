# Animated Favicon & Extension Icon Spec (from prompt.md)

## Animation Sequence (8-second loop)
- 0-2s: Blank (colored node, no text, node cycles colors)
- 2-4s: G (white "G" on colored node, Nunito Bold 24px favicon / 96px extension)
- 4-6s: Dot (white separator dot, 2px favicon / 8px extension)
- 6-8s: L (teal "L" on colored node, Nunito Bold 24px favicon / 96px extension)

## Color Transitions (smooth across all states)
#1A1C20 → #2AAFA9 → #E8624A → #D4A017 → #8B5CF6 → #4F7EC4 → #1A1C20

## Visual Design
- Outer Glow Rim: Gold/Amber (#D4A017), pulsing opacity 0.3-0.6
- Main Node: 18px radius (favicon) / 72px radius (extension)
- SVG glow filter with feGaussianBlur (stdDeviation: 2 favicon, 8 extension)
- Font: Nunito Bold (700)
- Text Centering: text-anchor: middle + dominant-baseline: central
- Background: Transparent
- Favicon viewBox: 64x64, Extension viewBox: 256x256

## Implementation
- client/public/favicon.svg → animated favicon
- chrome-extension/icons/ → animated extension icon (or assets/icons/)
- client/index.html: `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`
- Uses native SVG SMIL animation (<animate> elements)
- repeatCount="indefinite"

## Remaining TODO
- [x] Phase 1: Shadow block sync optimization done
- [ ] Phase 2: Create animated favicon SVG and extension icon SVG
- [ ] Phase 3: Move propagation indicator to calendar widget as compact expandable button
