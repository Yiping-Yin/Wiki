'use client';
/**
 * TextInput / TextArea · canonical form field primitives.
 *
 * Input consistency matches the Button tokens (--fs-body, var(--r-2) radius,
 * hairline border, accent focus ring). Three sizes: sm / md / lg.
 *
 * Inputs across Loom still reach for inline `style={{padding: '...'}}`; these
 * primitives are the drop-in replacement. Pass a `ref` directly via
 * forwardRef for sites that need imperative focus.
 */

import { forwardRef } from 'react';
import type { CSSProperties, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type Size = 'sm' | 'md' | 'lg';

const PADDING: Record<Size, string> = {
  sm: '4px 8px',
  md: '6px 10px',
  lg: '10px 14px',
};

const FONT: Record<Size, string> = {
  sm: 'var(--fs-caption)',
  md: 'var(--fs-small)',
  lg: 'var(--fs-body)',
};

function baseStyle(size: Size, invalid: boolean): CSSProperties {
  return {
    width: '100%',
    padding: PADDING[size],
    fontFamily: 'inherit',
    fontSize: FONT[size],
    lineHeight: 'var(--lh-body)',
    color: 'var(--fg)',
    background: 'var(--mat-thin-bg)',
    border: `0.5px solid ${invalid ? 'var(--tint-red)' : 'var(--mat-border)'}`,
    borderRadius: 'var(--r-2)',
    outline: 'none',
    transition: 'border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease)',
  };
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: Size;
  invalid?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { size = 'md', invalid = false, style, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`loom-text-input${className ? ' ' + className : ''}`}
      style={{ ...baseStyle(size, invalid), ...style }}
    />
  );
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: Size;
  invalid?: boolean;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { size = 'md', invalid = false, style, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`loom-text-area${className ? ' ' + className : ''}`}
      style={{
        ...baseStyle(size, invalid),
        resize: 'vertical',
        minHeight: '4em',
        ...style,
      }}
    />
  );
});
