import SwiftUI
import AppKit

/// Loom Vellum tokens — mirror of `loom-tokens.jsx` V object.
/// The single source of truth for palette + type across native SwiftUI.
/// Web side gets the same values via CSS variables injected at document-start
/// (see `LoomTokens.cssInjectionScript`).
///
/// **Design System v1.0 — 2026-04-28.** New canonical tokens live under the
/// `ds*` prefix and mirror `lib/loom-design-system.ts` + `app/globals-v2.css`
/// exactly. The legacy `paper / ink / hair / thread / ...` surface area is
/// preserved as backward-compat aliases that now point at the canonical
/// values, so existing call sites pick up the new palette without rewrites.
/// Per the plan (night 1), call sites are not edited; surface migration
/// happens on night 4.
enum LoomTokens {

    // MARK: - Design System v1.0 · canonical color tokens
    //
    // Mirrors `lib/loom-design-system.ts` and `app/globals-v2.css`. Eleven
    // colors, no others. Any new surface should use these directly.
    // Light and dark values are both live. Auto theme is time-based at
    // the shell level, then these dynamic colors resolve from the
    // NSWindow appearance.

    /// Paper · root background, deepest layer.
    static let dsPaperDeep   = Color.dynamic(light: 0xF4F0E4, dark: 0x1A1815)
    /// Paper · default surface (one layer up from root).
    static let dsPaper       = Color.dynamic(light: 0xF4F0E4, dark: 0x221E18)
    /// Paper · raised surface (two layers up).
    static let dsPaperUp     = Color.dynamic(light: 0xFAF7EC, dark: 0x2B2620)
    /// Paper · card surface (three layers up).
    static let dsPaperCard   = Color.dynamic(light: 0xEADFC9, dark: 0x332E27)

    /// Ink · primary body text + iconography.
    static let dsInk1        = Color.dynamic(light: 0x2A2520, dark: 0xE8E0CE)
    /// Ink · secondary / metadata.
    static let dsInk2        = Color.dynamic(light: 0x4A4339, dark: 0xB9AE93)
    /// Ink · muted / chrome.
    static let dsInk3        = Color.dynamic(light: 0x8A8373, dark: 0x8F8571)

    /// Hairline border · default 0.5px stroke.
    static let dsHair        = Color.dynamicAlpha(light: 0x1A1712, lightAlpha: 0.08,
                                                  dark: 0xE8E0CE, darkAlpha: 0.10)
    /// Hairline border · faintest layer.
    static let dsHairFaint   = Color.dynamicAlpha(light: 0x1A1712, lightAlpha: 0.04,
                                                  dark: 0xE8E0CE, darkAlpha: 0.05)

    /// Bronze accent · single source of truth, no variations.
    static let dsThread      = Color(hex: 0xC4A468)
    /// Bronze accent · 55% alpha for de-emphasised states.
    static let dsThreadMuted = Color(.sRGB,
                                     red:   196/255,
                                     green: 164/255,
                                     blue:  104/255,
                                     opacity: 0.55)

    // MARK: - Design System v1.0 · semantic state colors
    //
    // Added 2026-04-27. Four state colors + their muted (55% alpha)
    // variants. Mirror of `lib/loom-design-system.ts` and `globals-v2.css`.
    // Use these for destructive / success / info / caution surfaces —
    // never `Color.red` / ad-hoc hex / `LoomTokens.rose` for new code.

    /// Destructive — red. Delete / cancel / error states.
    static let dsAlert        = Color(hex: 0xC44743)
    /// Destructive · 55% alpha for de-emphasised state.
    static let dsAlertMuted   = Color(.sRGB,
                                      red:   196/255,
                                      green:  71/255,
                                      blue:   67/255,
                                      opacity: 0.55)

    /// Positive — sage. Confirmations, complete states.
    static let dsSuccess      = Color(hex: 0x6A8C5A)
    /// Positive · 55% alpha for de-emphasised state.
    static let dsSuccessMuted = Color(.sRGB,
                                      red:   106/255,
                                      green: 140/255,
                                      blue:   90/255,
                                      opacity: 0.55)

    /// Neutral informational tints — ink-blue.
    static let dsInfo         = Color(hex: 0x5A7A9A)
    /// Info · 55% alpha for de-emphasised state.
    static let dsInfoMuted    = Color(.sRGB,
                                      red:    90/255,
                                      green: 122/255,
                                      blue:  154/255,
                                      opacity: 0.55)

    /// Caution — warm amber, distinct from bronze accent.
    static let dsWarning      = Color(hex: 0xB98E3F)
    /// Caution · 55% alpha for de-emphasised state.
    static let dsWarningMuted = Color(.sRGB,
                                      red:   185/255,
                                      green: 142/255,
                                      blue:   63/255,
                                      opacity: 0.55)

    // MARK: - Design System v1.0 · hex string constants
    //
    // Mirror of the canonical `ds*` palette as `#RRGGBB` strings, for
    // cases where a Swift surface needs to inject the value into a
    // JS / CSS template literal (e.g. `LoomWebView.themeSyncScript`).
    // These MUST stay byte-equal to the SwiftUI `Color(hex: ...)`
    // values above — they're the same source of truth surfaced two
    // ways. Changing one requires changing the other.
    //
    // Light-mode hex constants are kept here even though SwiftUI tokens
    // currently default to dark values (light mode deferred per plan
    // open question #1). The legacy `themeSyncScript` palette had
    // distinct light/dark values; preserving that split here lets the
    // refactor be strictly substitution-equivalent rather than a
    // visual change.

    /// Dark-mode root background (`dsPaperDeep`).
    static let dsPaperDeepHexDark   = "#1A1815"
    /// Dark-mode primary ink (`dsInk1`).
    static let dsInk1HexDark        = "#E8E0CE"
    /// Dark-mode secondary ink (`dsInk2`).
    static let dsInk2HexDark        = "#B9AE93"
    /// Dark-mode chrome / muted (`dsInk3`-equivalent — historically
    /// surfaced as `--muted` `#6F6756` in the JS palette).
    static let dsMutedHexDark       = "#6F6756"
    /// Bronze accent (single source of truth; same in both modes).
    static let dsThreadHex          = "#C4A468"
    /// Bronze accent · text-pair, slightly lifted for dark backgrounds.
    static let dsThreadTextHexDark  = "#D4B478"

    /// Light-mode equivalents — preserved from the legacy palette
    /// values so the refactor doesn't change rendered output. When
    /// light mode is officially derived (open question #1), these
    /// move into a real `Color.dynamic` hex pair.
    static let dsPaperDeepHexLight  = "#F4F0E4"
    static let dsInk1HexLight       = "#2A2520"
    static let dsInk2HexLight       = "#4A4339"
    static let dsMutedHexLight      = "#8A8373"
    static let dsThreadTextHexLight = "#7A5E2E"

    // MARK: - Legacy aliases (backward compat)
    //
    // The old token names kept their call sites; values now point at the
    // canonical `ds*` palette so existing surfaces pick up Design System
    // v1.0 colors without per-view edits. Where an alias used to be
    // dynamic (light + dark), it stays dynamic — the dark value is
    // re-pointed at the canonical token, the light value is left as-is
    // until light mode is derived (open question #1 in the plan).
    //
    // NOTE on the paper/paperDeep naming swap: legacy `paper` was the
    // deepest tone (0x1A1815) and `paperDeep` was one step up (0x221E18),
    // which inverts the canonical naming. Per plan instruction "prefer
    // the new canonical", aliases now follow canonical semantics:
    // `paper` = canonical `dsPaper` (default surface), `paperDeep` =
    // canonical `dsPaperDeep` (root). This is a deliberate visual shift
    // surfaces will pick up automatically.

    /// @deprecated Use `dsPaper`.
    static let paper      = Color.dynamic(light: 0xF4F0E4, dark: 0x221E18)
    /// @deprecated Use `dsPaperDeep`.
    static let paperDeep  = Color.dynamic(light: 0xEADFC9, dark: 0x1A1815)
    /// @deprecated Use `dsPaperUp`.
    static let paperShade = Color.dynamic(light: 0xE3D8BE, dark: 0x2B2620)
    /// @deprecated Use `dsInk1`.
    static let ink        = Color.dynamic(light: 0x2A2520, dark: 0xE8E0CE)
    /// @deprecated Use `dsInk2`.
    static let ink2       = Color.dynamic(light: 0x4A4339, dark: 0xB9AE93)
    /// @deprecated Use `dsInk3`.
    static let ink3       = Color.dynamic(light: 0x6B6355, dark: 0x8F8571)
    /// @deprecated Use `dsInk3`.
    static let muted      = Color.dynamic(light: 0x8A8373, dark: 0x8F8571)
    /// @deprecated Use `dsHair`.
    static let hair       = Color.dynamicAlpha(light: 0x1A1712, lightAlpha: 0.09,
                                               dark: 0xE8E0CE, darkAlpha: 0.10)
    /// @deprecated Use `dsHairFaint`.
    static let hairFaint  = Color.dynamicAlpha(light: 0x1A1712, lightAlpha: 0.04,
                                               dark: 0xE8E0CE, darkAlpha: 0.05)

    // MARK: - Night · ink-wash

    static let night      = Color(hex: 0x13110D)
    static let nightDeep  = Color(hex: 0x0A0907)
    static let nightWarm  = Color(hex: 0x1A1712)
    static let candle     = Color(hex: 0xECE2C9)
    static let candle2    = Color(hex: 0xB9AE93)
    static let mutedNight = Color(hex: 0x6F6756)
    static let hairNight  = Color(hex: 0xECE2C9, opacity: 0.08)

    // MARK: - Inks — earth only, never neon. `thread` is AI/selection/focus.
    //
    // Bronzes (thread/threadHi) stay static — they're the accent in both
    // modes and read fine on both paper and night. The darker earth tones
    // (rose/sage/ochre/gold/indigo/plum) need lift in dark mode or status
    // text collapses to ~2-3:1 contrast against 0x1A1815. Dark values align
    // with `globals.css` `--tint-*` dark overrides so native badges + web
    // chrome share the same palette.
    //
    // Design System v1.0: `thread` and `threadHi` both alias canonical
    // `dsThread` (#C4A468). The legacy darker `thread` (#9E7C3E) is gone;
    // single source of truth for bronze going forward.

    /// @deprecated Use `dsThread`.
    static let thread   = Color(hex: 0xC4A468)
    /// @deprecated Use `dsThread`.
    static let threadHi = Color(hex: 0xC4A468)
    static let gold     = Color.dynamic(light: 0xB98E3F, dark: 0xD8AE60)
    static let ochre    = Color.dynamic(light: 0xA8783E, dark: 0xD8A168)
    static let rose     = Color.dynamic(light: 0x8F4646, dark: 0xC27070)
    static let sage     = Color.dynamic(light: 0x5C6E4E, dark: 0x8CA07A)
    static let indigo   = Color.dynamic(light: 0x3A477A, dark: 0x7E8CC7)
    static let plum     = Color.dynamic(light: 0x5E3D5C, dark: 0xA77FA4)
    static let umber    = Color(hex: 0x5C3F2A)

    // MARK: - Type stacks — same cascade as the web for cross-surface consistency.

    static let serifStack   = #"\"EB Garamond\", \"Iowan Old Style\", \"Palatino Linotype\", Georgia, serif"#
    static let displayStack = #"\"Cormorant Garamond\", \"EB Garamond\", \"Iowan Old Style\", serif"#
    static let sansStack    = #"\"Inter\", -apple-system, BlinkMacSystemFont, \"SF Pro Text\", system-ui, sans-serif"#
    static let scriptStack  = #"\"Caveat\", \"Homemade Apple\", \"Bradley Hand\", \"Segoe Print\", cursive"#
    static let monoStack    = #"\"JetBrains Mono\", \"SF Mono\", ui-monospace, Menlo, monospace"#

    /// Native-side font for display (Cormorant fallback chain). SwiftUI doesn't
    /// accept CSS-style cascades, so we ask for the first available.
    static func display(size: CGFloat, italic: Bool = false, weight: Font.Weight = .regular) -> Font {
        let base = Font.custom("Cormorant Garamond", size: size)
            .weight(weight)
        return italic ? base.italic() : base
    }

    static func serif(size: CGFloat, italic: Bool = false, weight: Font.Weight = .regular) -> Font {
        let base = Font.custom("EB Garamond", size: size).weight(weight)
        return italic ? base.italic() : base
    }

    static func sans(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        Font.system(size: size, weight: weight) // Inter falls back to SF
    }

    static func mono(size: CGFloat) -> Font {
        Font.system(size: size, design: .monospaced)
    }

    // MARK: - Design System v1.0 · type ladder
    //
    // Mirrors the 7-level type ladder from the plan (display-1/2/3, body,
    // caption, eyebrow, mono). SwiftUI surfaces consume these via
    // `Text("...").font(DSType.body.font)`. The `DSType` enum lives at the
    // file scope below the `LoomTokens` enum to keep the API flat:
    // `DSType.display1` rather than `LoomTokens.DSType.display1`.

    // MARK: - Design System v1.0 · spacing scale (8pt grid)
    //
    // Mirrors the 6-step spacing scale from the plan. Use `DSSpace.md.value`
    // anywhere a CGFloat is expected.

    // MARK: - Design System v1.0 · motion durations
    //
    // Mirrors the 3-step motion scale (fast / normal / slow). Use
    // `.animation(.easeOut(duration: DSMotion.normal.duration), value: x)`.

    // MARK: - Design System v1.0 · corner radii

    // (Type/Space/Motion/Radius are top-level enums declared below for a
    // flat call-site API; see end of file.)

    // MARK: - Web → CSS variable injection

    /// Inject Loom Vellum tokens as CSS variables on `:root`, plus load the
    /// Google Fonts we need, at document-start. The web app can then reference
    /// `var(--loom-paper)`, `var(--loom-serif)`, etc., and inherit the native
    /// palette with zero per-component edits.
    ///
    /// For production the fonts should be bundled (offline + App Store), but
    /// for now the Google stylesheet is fine — same cascade the design files
    /// use, identical WKWebView rendering.
    static let cssInjectionScript: String = """
    (() => {
      try {
        if (!document.getElementById('loom-tokens-css')) {
          const style = document.createElement('style');
          style.id = 'loom-tokens-css';
          style.textContent = `
            :root {
              --loom-paper: #F4F0E4;
              --loom-paper-deep: #EADFC9;
              --loom-paper-shade: #E3D8BE;
              --loom-ink: #2A2520;
              --loom-ink-2: #4A4339;
              --loom-ink-3: #6B6355;
              --loom-muted: #8A8373;
              --loom-hair: rgba(26,23,18,0.09);
              --loom-hair-faint: rgba(26,23,18,0.04);

              --loom-night: #13110D;
              --loom-candle: #ECE2C9;
              --loom-candle-2: #B9AE93;

              --loom-thread: #9E7C3E;
              --loom-thread-hi: #C4A468;
              --loom-gold: #B98E3F;
              --loom-ochre: #A8783E;
              --loom-rose: #8F4646;
              --loom-sage: #5C6E4E;
              --loom-indigo: #3A477A;
              --loom-plum: #5E3D5C;
              --loom-umber: #5C3F2A;

              --loom-serif: "EB Garamond", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
              --loom-display: "Cormorant Garamond", "EB Garamond", "Iowan Old Style", serif;
              --loom-sans: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
              --loom-script: "Caveat", "Homemade Apple", "Bradley Hand", "Segoe Print", cursive;
              --loom-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace;
            }
            body {
              font-feature-settings: "kern", "liga", "onum";
            }
            .loom-smallcaps {
              font-variant: small-caps;
              letter-spacing: 0.08em;
            }
            /* Vellum chrome sweep — any `.t-caption2` or `[style*="uppercase"]`
               element gets promoted from sans-uppercase-tracked dashboard
               typography to serif small-caps book typography. Does the job
               of a mechanical per-site edit across ~20 components without
               touching them individually. Injected at document-start so
               PostCSS/Tailwind purge can't strip it.

               The `[style*="uppercase"]` match is a reliable proxy because
               React serializes inline styles to the `style=` DOM attribute
               as a string; any component with inline `textTransform:
               'uppercase'` becomes `style="…text-transform: uppercase…"`
               in the DOM. `!important` is needed to beat the inline style. */
            .t-caption2[style*="uppercase"],
            .t-caption2[style*="UPPERCASE"],
            [style*="text-transform: uppercase"],
            [style*="text-transform:uppercase"] {
              text-transform: none !important;
              font-variant: small-caps !important;
              font-family: var(--loom-serif) !important;
              font-weight: 500 !important;
              letter-spacing: 0.05em !important;
              font-size: 0.84rem !important;
            }
          `;
          document.head.appendChild(style);
        }
        /*
         * Font strategy: rely on the system-font fallback chain
         * declared in globals.css (`--serif`, `--display`, `--sans`,
         * `--mono`). macOS ships "New York" (custom serif, Catalina+)
         * and "Iowan Old Style" which are both close-enough to EB
         * Garamond / Cormorant for Vellum identity, plus "SF Pro Text"
         * (sans), "SF Mono" (mono). Zero CDN round-trip, zero
         * offline-fallback surprise.
         *
         * Previously we injected a Google Fonts <link> that pulled in
         * EB Garamond + Cormorant + Inter + JetBrains Mono + Caveat.
         * Removed 2026-04-22 (night) because: (1) the sandboxed app
         * can't always reach the CDN, (2) the fallback chain already
         * carries the identity, (3) App Store review prefers
         * self-contained apps over runtime network dependencies for
         * chrome. Can re-enable under an opt-in flag later if needed.
         */
      } catch (_) {}
    })();

    /* Breathing Margins — idle detection. After 4s with no
       mousemove/scroll/keydown/pointerdown, tag <body> with
       `loom-idle`. Any activity clears the class immediately.
       Passive listeners so scrolling stays 60fps. */
    (() => {
      try {
        if (window.__loomIdleInstalled) return;
        window.__loomIdleInstalled = true;
        const IDLE_MS = 4000;
        let timer = null;
        const setIdle = () => {
          if (document.body) document.body.classList.add('loom-idle');
        };
        const wakeUp = () => {
          if (document.body) document.body.classList.remove('loom-idle');
          if (timer) clearTimeout(timer);
          timer = setTimeout(setIdle, IDLE_MS);
        };
        const opts = { passive: true };
        window.addEventListener('mousemove', wakeUp, opts);
        window.addEventListener('scroll', wakeUp, opts);
        window.addEventListener('keydown', wakeUp, opts);
        window.addEventListener('pointerdown', wakeUp, opts);
        wakeUp();
      } catch (_) {}
    })();

    /* Spatial Continuity — animated scroll restore for /wiki/* and
       /knowledge/* pages. Reads saved offset from localStorage,
       jumps 120px short, then smooth-scrolls to the saved position
       so the return feels like finding your place. Saves on
       scroll-stop (400ms debounce). */
    (() => {
      try {
        const path = location.pathname;
        if (!/^\\/wiki\\//.test(path) && !/^\\/knowledge\\//.test(path)) return;
        const key = 'loom:scroll:' + path;
        const saved = parseInt(localStorage.getItem(key) || '0', 10);
        if (saved > 0) {
          const start = Math.max(0, saved - 120);
          window.scrollTo({ top: start, behavior: 'instant' });
          requestAnimationFrame(() => {
            window.scrollTo({ top: saved, behavior: 'smooth' });
          });
        }
        let t = null;
        window.addEventListener('scroll', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            localStorage.setItem(key, String(Math.floor(window.scrollY)));
          }, 400);
        }, { passive: true });
      } catch (_) {}
    })();
    """
}

private extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >>  8) & 0xFF) / 255,
            blue:  Double( hex        & 0xFF) / 255,
            opacity: opacity
        )
    }

    /// Build a `Color` that flips between two sRGB values based on the
    /// effective `NSAppearance`. Bridges through `NSColor` because SwiftUI
    /// has no first-party "dynamic color by appearance" init on macOS yet.
    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor.fromHex(isDark ? dark : light, alpha: 1.0)
        })
    }

    /// Same as `dynamic(light:dark:)` but with per-mode opacity — used by
    /// hair/hairFaint where both tone and translucency flip between modes.
    static func dynamicAlpha(light: UInt32, lightAlpha: CGFloat,
                             dark: UInt32, darkAlpha: CGFloat) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor.fromHex(isDark ? dark : light,
                                   alpha: isDark ? darkAlpha : lightAlpha)
        })
    }
}

private extension NSColor {
    static func fromHex(_ hex: UInt32, alpha: CGFloat) -> NSColor {
        NSColor(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green:   CGFloat((hex >>  8) & 0xFF) / 255,
            blue:    CGFloat( hex        & 0xFF) / 255,
            alpha:   alpha
        )
    }
}

// MARK: - Design System v1.0 · type ladder

/// Seven-step type ladder — mirrors `lib/loom-design-system.ts` and the
/// `globals-v2.css` utility classes (`.display-1 / .display-2 / .display-3
/// / .body / .caption / .eyebrow / .mono`). The plan describes the system
/// as "6-step ladder, 3 families" but enumerates 7 named slots; we keep all
/// 7 here so SwiftUI surfaces have a 1:1 mapping with web utility classes.
///
/// SwiftUI's `Font.system(size:weight:design:)` cascade picks the system
/// serif (New York / Iowan Old Style) for `.serif` design and SF Mono for
/// `.monospaced`, which matches the same fallback chain the webview uses
/// when EB Garamond / IBM Plex Mono aren't bundled. Bundled-font path can
/// be wired in via `LoomTokens.serif(...)` / `.display(...)` later without
/// touching call sites.
enum DSType {
    case display1
    case display2
    case display3
    case body
    case caption
    case eyebrow
    case mono

    /// Point size for the slot.
    var size: CGFloat {
        switch self {
        case .display1: return 32
        case .display2: return 22
        case .display3: return 16
        case .body:     return 16
        case .caption:  return 13
        case .eyebrow:  return 11
        case .mono:     return 13
        }
    }

    /// Line height multiplier (matches CSS `line-height` from the plan).
    var lineHeight: CGFloat {
        switch self {
        case .display1: return 1.15
        case .display2: return 1.20
        case .display3: return 1.30
        case .body:     return 1.62
        case .caption:  return 1.45
        case .eyebrow:  return 1.00
        case .mono:     return 1.55
        }
    }

    /// Weight for the slot. `display-1` is 400; everything else 400 or 500
    /// per the plan's type table.
    var weight: Font.Weight {
        switch self {
        case .display1: return .regular   // 400
        case .display2: return .medium    // 500
        case .display3: return .medium    // 500
        case .body:     return .regular   // 400
        case .caption:  return .regular   // 400
        case .eyebrow:  return .medium    // 500
        case .mono:     return .regular   // 400
        }
    }

    /// Italic by default for display 1/2 and caption (per plan).
    var isItalic: Bool {
        switch self {
        case .display1, .display2, .caption: return true
        case .display3, .body, .eyebrow, .mono: return false
        }
    }

    /// Font family family-class (SwiftUI `Font.Design`).
    /// `--display` and `--serif` both resolve to `.serif` on the native
    /// side — SwiftUI's serif design covers both Cormorant- and Charter-
    /// shaped requirements at the slot's weight/size. `.monospaced` for
    /// mono. Sans is unused in this ladder.
    var fontDesign: Font.Design {
        switch self {
        case .display1, .display2, .display3,
             .body, .caption, .eyebrow:
            return .serif
        case .mono:
            return .monospaced
        }
    }

    /// Letter-spacing tracking (CSS `letter-spacing` em → SwiftUI tracking
    /// pts at this slot's size). Eyebrow is the only slot with non-zero
    /// tracking per the plan: `0.16em` at 11pt = ~1.76pt.
    var tracking: CGFloat {
        switch self {
        case .eyebrow: return 0.16 * 11
        default:       return 0
        }
    }
}

extension DSType {
    /// Convenience SwiftUI `Font` for the slot. Italics applied via
    /// `.italic()` modifier. Tracking is applied separately on the
    /// `Text` (use `.tracking(DSType.eyebrow.tracking)` at the call site
    /// for eyebrow labels).
    var font: Font {
        let base = Font.system(size: size, weight: weight, design: fontDesign)
        return isItalic ? base.italic() : base
    }
}

// MARK: - Design System v1.0 · spacing (8pt grid)

/// Six-step spacing scale — matches `--space-xs` … `--space-2xl` in the
/// CSS token file. Use `.value` to read the raw `CGFloat` for layout APIs:
/// `VStack(spacing: DSSpace.md.value)` / `.padding(DSSpace.lg.value)`.
enum DSSpace: CGFloat {
    case xs  = 4    // 0.25rem
    case sm  = 8    // 0.5rem
    case md  = 16   // 1rem
    case lg  = 24   // 1.5rem
    case xl  = 40   // 2.5rem
    case xxl = 64   // 4rem  — CGFloat-friendly name for `2xl`

    /// Raw `CGFloat` value of the token.
    var value: CGFloat { rawValue }
}

// MARK: - Design System v1.0 · motion

/// Three-step motion scale — fast / normal / slow, all `ease-out`. Use
/// `.animation(.easeOut(duration: DSMotion.fast.duration), value: x)`.
enum DSMotion {
    case fast       // 140ms · hover, active, button-press
    case normal     // 220ms · layout-shift, expand/collapse
    case slow       // 400ms · route-transition, modal-open

    /// Duration in seconds for use with `Animation.easeOut(duration:)`.
    var duration: TimeInterval {
        switch self {
        case .fast:   return 0.140
        case .normal: return 0.220
        case .slow:   return 0.400
        }
    }
}

// MARK: - Design System v1.0 · corner radii

/// Three-step radius scale — sm (chips), md (cards), lg (sheets). Use
/// `.cornerRadius(DSRadius.md.value)` or
/// `.clipShape(RoundedRectangle(cornerRadius: DSRadius.lg.value))`.
enum DSRadius: CGFloat {
    case sm = 4     // chips, small buttons
    case md = 8     // cards, surfaces
    case lg = 12    // sheets, full panels

    /// Raw `CGFloat` value of the token.
    var value: CGFloat { rawValue }
}
