# LOOM — Product & Logo Design Brief

## What is Loom

Loom is a personal thinking tool for macOS. It applies the ancient Chinese silk-tapestry craft **kesi (缂丝)** to the act of reading and thinking. The user reads documents, asks AI about passages, anchors thoughts to specific text, and gradually weaves a personal tapestry of understanding.

The name "Loom" is literal — it is not a metaphor. The product IS a loom; the MacBook Pro IS the physical frame. Every interaction maps to a weaving action:

| Weaving action | Product action |
|---|---|
| Viewing the warp | Reading a document |
| Passing the shuttle | Asking AI a question |
| Weft being woven | AI response arriving |
| Completing a color block | Committing a thought (✓) |
| Panel entering library | Crystallizing a thought map |
| Unfolding the tapestry | Opening /kesi — the personal fabric |

## The Kesi Technique: 通经断纬

Kesi's defining technique is **通经断纬** — continuous warp, broken weft:

- **Warp threads (经)** = vertical, continuous, always present — these are the source documents the user reads
- **Weft threads (纬)** = horizontal, discontinuous, woven in by the user — these are the individual thoughts, each bounded to one passage

The warp is given. The weft is created. Together they form fabric.

## The Mark System

The product mark is derived from the word LOOM itself. When deconstructed into strokes:

```
L = 1 vertical + 1 horizontal
O = 2 verticals + 2 horizontals
O = 2 verticals + 2 horizontals
M = 3 verticals + 2 horizontals
───────────────────────────────
Total: 8 verticals + 7 horizontals
```

**8 warp threads IS the logo.** The 7 wefts are intentionally absent — they are the negative space that the user fills by thinking. This is the core concept of the icon.

### Four Visual Expressions

The mark has four forms, all expressing "warp threads of a kesi loom":

1. **Brand Icon (8 warps)** — favicon, dock icon, app store
   - 8 white vertical threads on a gradient rounded-square background
   - Gradient: `#0a84ff → #5e5ce6 → #bf5af2` (Apple system blue → indigo → purple)
   - White strokes at 90% opacity, rounded caps
   - Must be readable at 16×16px (favicon scale)
   - The 7 wefts are NOT drawn — they are the user's negative space

2. **Static Icon (12 warps)** — empty state placeholder
   - 12 threads for denser visual presence
   - Subtle silk-sheen gradient on each thread (center bright, edges fade)
   - No animation, purely decorative

3. **Active Icon (3+1 shuttle)** — loading indicator
   - Minimal readable loom at smallest scale
   - 3 warp threads + 1 animated horizontal shuttle
   - Only appears when AI response exceeds 600ms

4. **Alive Icon (8 warps + shimmer)** — home page breathing state
   - 8 threads, each with independent shimmer animation (3.2–5.4s periods)
   - Light travels along each thread like sunlight catching silk
   - A faint shuttle traverses horizontally every 10s
   - Aurora halo: two soft radial gradients (pink-purple + cool blue)

## Design Philosophy

### §0 Apple Continuum
Loom must feel like a native Apple application. P3 color gamut, SF Pro typography, spring animations matching macOS Sequoia, system keyboard conventions, native scrollbar behavior.

### §1 润物细无声 (Silent Spring Rain) — Supreme Principle
The tool exists, the action happens, the result is rich — but the user only feels the result. No progress bars, no "AI is thinking" spinners, no save confirmations, no status badges. The system quietly works in the background like spring rain nourishing the earth.

### §24 Apple is an Apple
No logo or wordmark appears anywhere inside the product's working surface. Brand exists only in: dock icon, favicon, about page, and app store listing. "Apple's logo is never found inside Apple's own apps."

### §26 Subtraction
When in doubt, remove. Every pixel must earn its place.

## Color Palette

### Brand Gradient (Primary)
```
#0a84ff (Apple Blue)  →  #5e5ce6 (Apple Indigo)  →  #bf5af2 (Apple Purple)
Direction: 135° diagonal
```

### Foreground
- Light mode: `#1d1d1f` (Apple near-black)
- Dark mode: `#f5f5f7` (Apple off-white)

### Background
- Light mode: `#ffffff` pure white
- Dark mode: `#000000` true black (OLED)

### Full Apple System Tint Palette
```
Red: #ff3b30    Orange: #ff9500   Yellow: #ffcc00
Green: #34c759  Mint: #00c7be     Teal: #30b0c7
Cyan: #32ade6   Blue: #007aff     Indigo: #5856d6
Purple: #af52de Pink: #ff2d55     Brown: #a2845e
```

## Typography
- Primary: SF Pro Text / SF Pro Display (-apple-system)
- Monospace: SF Mono
- Chinese: system default (PingFang SC)

## Target Platforms for the Icon
- **macOS Dock**: 1024×1024 source, rendered at various sizes down to 16×16
- **Favicon**: 32×32, 16×16 (must remain legible — 8 thin lines)
- **Apple Touch Icon**: 180×180
- **App Store**: 1024×1024 (no rounded corners in source)
- **Dynamic Island / Notch area**: monochrome variant needed

## What Makes This Icon Unique

1. **It is literal**: 8 vertical lines = 8 warp threads of a loom. No abstraction needed.
2. **It encodes the name**: L+O+O+M = exactly 8 vertical strokes. The icon IS the name decomposed.
3. **The absence is the point**: No weft is drawn. The empty space between warps is what the user fills with their thinking.
4. **It scales to motion**: The same 8 lines can be static (brand), shimmer (alive), or reduced to 3+1 (active). One concept, four expressions.
5. **It follows Apple's design language**: Gradient background uses Apple's own system colors. No skeuomorphism, no 3D effects, no drop shadows inside the icon.

## Existing Icon Reference

The current icon is an SVG with 8 vertical white lines on a rounded-square gradient background (`#0a84ff → #5e5ce6 → #bf5af2`, 135°). Each line is 2.2px wide, 90% white opacity, with rounded caps. The lines are evenly spaced within the safe area of the icon.

## What I Need from This Design Session

- Refined version of the 8-warp brand icon that works across all sizes (1024 → 16px)
- Exploration of thread weight, spacing, and gradient to maximize legibility at small sizes while maintaining silk-like elegance at large sizes
- Monochrome variant for Dynamic Island / system contexts
- Optional: subtle texture or material treatment that evokes real silk thread without violating flatness
- The icon should feel: quiet, precise, alive, and unmistakably about weaving
