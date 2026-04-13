'use client';
/**
 * Settings panel — opened with ⌘, (Cmd+Comma), the macOS system shortcut.
 *
 * Manages all user preferences:
 *   - Appearance: theme (light / dark / auto), accent override
 *   - Reading: reduce motion
 *   - Sidebar: default mode (hidden / mini / pinned)
 *   - Reset: clear all wiki:* localStorage keys
 *
 * Designed as a quiet sheet, not a system dialog impersonation.
 */
import { useEffect, useState } from 'react';
import { type AiCliKind, readAiCliPreference, writeAiCliPreference } from '../lib/ai-cli';
import { useSmallScreen } from '../lib/use-small-screen';

type Theme = 'auto' | 'light' | 'dark';
type SbMode = 'hidden' | 'pinned';

const ACCENT_PRESETS: { name: string; light: string; dark: string }[] = [
  { name: 'Blue',   light: '#0071e3', dark: '#0a84ff' },
  { name: 'Indigo', light: '#5856d6', dark: '#5e5ce6' },
  { name: 'Purple', light: '#af52de', dark: '#bf5af2' },
  { name: 'Pink',   light: '#ff2d55', dark: '#ff375f' },
  { name: 'Red',    light: '#ff3b30', dark: '#ff453a' },
  { name: 'Orange', light: '#ff9500', dark: '#ff9f0a' },
  { name: 'Green',  light: '#34c759', dark: '#30d158' },
  { name: 'Teal',   light: '#30b0c7', dark: '#40c8e0' },
];

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
    localStorage.removeItem('theme');
  } else {
    root.classList.toggle('dark', t === 'dark');
    localStorage.setItem('theme', t);
  }
}

function applyAccent(idx: number | null) {
  const root = document.documentElement;
  if (idx === null) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-soft');
    localStorage.removeItem('wiki:accent');
    return;
  }
  const preset = ACCENT_PRESETS[idx];
  if (!preset) return;
  const isDark = root.classList.contains('dark');
  const c = isDark ? preset.dark : preset.light;
  root.style.setProperty('--accent', c);
  root.style.setProperty('--accent-soft', `color-mix(in srgb, ${c} 14%, transparent)`);
  localStorage.setItem('wiki:accent', String(idx));
}

function applyReduceMotion(on: boolean) {
  document.documentElement.style.setProperty('--motion-scale', on ? '0.001' : '1');
  if (on) localStorage.setItem('wiki:reduce-motion', '1');
  else localStorage.removeItem('wiki:reduce-motion');
}

export function SettingsPanel() {
  const smallScreen = useSmallScreen();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');
  const [accent, setAccent] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [defaultMode, setDefaultMode] = useState<SbMode>('hidden');
  const [aiCli, setAiCli] = useState<AiCliKind>('codex');

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const t = localStorage.getItem('theme');
      setTheme(t === 'dark' ? 'dark' : t === 'light' ? 'light' : 'auto');
      const a = localStorage.getItem('wiki:accent');
      setAccent(a ? parseInt(a, 10) : null);
      setReduceMotion(localStorage.getItem('wiki:reduce-motion') === '1');
      const m = localStorage.getItem('wiki:sidebar:mode');
      if (m === 'pinned' || m === 'hidden') setDefaultMode(m);
      setAiCli(readAiCliPreference());
    } catch {}
  }, []);

  // Hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onTheme = (t: Theme) => { setTheme(t); applyTheme(t); };
  const onAccent = (i: number | null) => { setAccent(i); applyAccent(i); };
  const onReduceMotion = (on: boolean) => { setReduceMotion(on); applyReduceMotion(on); };
  const onSbMode = (m: SbMode) => {
    setDefaultMode(m);
    try { localStorage.setItem('wiki:sidebar:mode', m); } catch {}
    document.body.classList.toggle('sidebar-pinned', m === 'pinned');
  };
  const onAiCli = (cli: AiCliKind) => {
    setAiCli(cli);
    writeAiCliPreference(cli);
  };

  const resetAll = () => {
    if (!confirm('Reset all UI preferences? This keeps your reading traces, highlights, notes, and pins.')) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === 'theme' || k === 'wiki:accent' || k === 'wiki:reduce-motion' || k === 'wiki:sidebar:mode' || k === 'loom:ai-cli') {
          keys.push(k);
        }
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
    window.location.reload();
  };

  if (!open) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 140,
        background: 'rgba(0,0,0,0.28)',
        display: 'flex',
        alignItems: smallScreen ? 'stretch' : 'flex-start',
        justifyContent: 'center',
        paddingTop: smallScreen ? 0 : '11vh',
        backdropFilter: 'saturate(125%) blur(7px)',
        WebkitBackdropFilter: 'saturate(125%) blur(7px)',
        animation: 'lpFade 0.18s var(--ease)',
      }}
    >
      <div
        role="dialog"
        aria-label="Settings"
        style={{
          width: smallScreen ? '100vw' : 'min(560px, 92vw)',
          minHeight: smallScreen ? '100vh' : 'auto',
          borderTop: smallScreen ? 'none' : '0.5px solid var(--mat-border)',
          borderBottom: smallScreen ? 'none' : '0.5px solid var(--mat-border)',
          background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
          maxHeight: smallScreen ? '100vh' : '78vh',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          paddingTop: smallScreen ? 'max(8px, env(safe-area-inset-top, 0px))' : 0,
          paddingBottom: smallScreen ? 'max(8px, env(safe-area-inset-bottom, 0px))' : 0,
        }}
      >
        {/* Minimal title bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: smallScreen ? '0.85rem 1rem' : '0.85rem 1.2rem',
          borderBottom: '0.5px solid var(--mat-border)',
        }}>
          <div className="t-headline" style={{
            color: 'var(--fg)',
            fontFamily: 'var(--display)',
            letterSpacing: '-0.014em',
          }}>Settings</div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            title="Close (Esc)"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontFamily: 'var(--mono)',
              fontWeight: 600,
              letterSpacing: '0.04em',
              padding: 0,
            }}
          >Esc</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: smallScreen ? '1.05rem 1rem 1.2rem' : '1.25rem 1.4rem 1.45rem' }}>
          <Section label="Appearance">
            <Row label="Theme">
              <Segmented<Theme>
                value={theme}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
                onChange={onTheme}
              />
            </Row>
            <Row label="Accent">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ACCENT_PRESETS.map((p, i) => (
                  <button
                    key={p.name}
                    onClick={() => onAccent(accent === i ? null : i)}
                    aria-label={p.name}
                    title={p.name}
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: p.light,
                      border: accent === i ? '1.5px solid var(--fg)' : '0.5px solid var(--mat-border)',
                      cursor: 'pointer', padding: 0,
                      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.45)',
                      transform: accent === i ? 'scale(1.08)' : 'scale(1)',
                      transition: 'transform 0.16s var(--ease-spring)',
                    }}
                  />
                ))}
              </div>
            </Row>
          </Section>

          <Section label="Sidebar">
            <Row label="Default mode">
              <Segmented<SbMode>
                value={defaultMode}
                options={[{ value: 'hidden', label: 'Hidden' }, { value: 'pinned', label: 'Pinned' }]}
                onChange={onSbMode}
              />
            </Row>
          </Section>

          <Section label="AI">
            <Row label="Preferred CLI">
              <Segmented<AiCliKind>
                value={aiCli}
                options={[
                  { value: 'codex', label: 'Codex CLI' },
                  { value: 'claude', label: 'Claude CLI' },
                ]}
                onChange={onAiCli}
              />
            </Row>
            <p className="t-caption" style={{ marginTop: -6, color: 'var(--muted)', lineHeight: 1.5 }}>
              Used by passage chat, note organization, and inline note completion. If the selected CLI is unavailable, Loom quietly falls back to the other allowed CLI.
            </p>
          </Section>

          <Section label="Motion">
            <Row label="Reduce motion">
              <Toggle checked={reduceMotion} onChange={onReduceMotion} />
            </Row>
          </Section>

          <Section label="Data">
            <button
              onClick={resetAll}
              style={{
                background: 'transparent',
                border: '0.5px solid var(--tint-red)',
                borderRadius: 999,
                padding: '8px 16px',
                cursor: 'pointer',
                color: 'var(--tint-red)',
                fontFamily: 'var(--display)',
                fontWeight: 700,
                fontSize: '0.82rem',
              }}
            >Reset all preferences</button>
            <p className="t-caption" style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.5 }}>
              Clears theme, accent, motion, sidebar, and AI provider preferences. Reading traces, anchored notes, highlights, history, and pins stay intact.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.6rem' }}>
      <div className="t-caption2" style={{
        textTransform: 'uppercase', letterSpacing: '0.10em',
        color: 'var(--muted)', fontWeight: 700, marginBottom: 10,
      }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '0.5px solid var(--mat-border)', paddingTop: 10 }}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <span className="t-subhead" style={{ color: 'var(--fg)', fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{
      display: 'inline-flex',
      gap: 10,
      borderBottom: '0.5px solid var(--mat-border)',
    }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            background: 'transparent',
            color: value === o.value ? 'var(--fg)' : 'var(--muted)',
            border: 0,
            borderBottom: value === o.value ? '1px solid var(--accent)' : '1px solid transparent',
            borderRadius: 0,
            padding: '4px 0 5px',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: value === o.value ? 700 : 500,
            fontFamily: 'var(--display)',
            letterSpacing: '-0.005em',
            transition: 'color 0.18s var(--ease), border-color 0.18s var(--ease)',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 999,
        background: checked ? 'var(--accent)' : 'var(--surface-3)',
        border: '0.5px solid var(--mat-border)',
        cursor: 'pointer', padding: 0,
        position: 'relative',
        transition: 'background 0.22s var(--ease)',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 1.5, left: checked ? 17 : 1.5,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'left 0.22s var(--ease-spring)',
      }} />
    </button>
  );
}
