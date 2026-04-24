import SwiftUI
import AppKit

/// Loom Vellum tokens — mirror of `loom-tokens.jsx` V object.
/// The single source of truth for palette + type across native SwiftUI.
/// Web side gets the same values via CSS variables injected at document-start
/// (see `LoomTokens.cssInjectionScript`).
enum LoomTokens {

    // MARK: - Day · warm vellum

    // Paper / ink values kept in lock-step with globals.css so the native
    // chrome matches the screen-tuned webview rendering exactly (previously
    // they drifted ~2 steps warmer and darker, which read as a seam at the
    // sidebar edge). The base tones are dynamic — warm vellum in light
    // mode, ink-wash night in dark mode — so every `.background(LoomTokens.
    // paper)` surface adapts without per-view code. Dark values come from
    // the "Night · ink-wash" palette below (night/candle/mutedNight/hairNight).
    // Dark values align with `app/globals.css` `:root@dark` variables so
    // the native chrome and the webview meet without a seam at the
    // sidebar edge (paper = web --bg, ink = web --fg). Supporting
    // paperDeep/paperShade/ink2/ink3/muted pick nearby ink-wash tones
    // from the "Night" palette below since they have no direct web var.
    static let paper      = Color.dynamic(light: 0xF4F0E4, dark: 0x1A1815)
    static let paperDeep  = Color.dynamic(light: 0xEADFC9, dark: 0x221E18)
    static let paperShade = Color.dynamic(light: 0xE3D8BE, dark: 0x2B2620)
    static let ink        = Color.dynamic(light: 0x2A2520, dark: 0xE8E0CE)
    static let ink2       = Color.dynamic(light: 0x4A4339, dark: 0xB9AE93)
    static let ink3       = Color.dynamic(light: 0x6B6355, dark: 0x8F8571)
    static let muted      = Color.dynamic(light: 0x8A8373, dark: 0x6F6756)
    static let hair       = Color.dynamicAlpha(light: 0x1A1712, lightAlpha: 0.09,
                                               dark: 0xECE2C9, darkAlpha: 0.08)
    static let hairFaint  = Color.dynamicAlpha(light: 0x1A1712, lightAlpha: 0.04,
                                               dark: 0xECE2C9, darkAlpha: 0.04)

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
    static let thread   = Color(hex: 0x9E7C3E)
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
