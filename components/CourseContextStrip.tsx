'use client';

/**
 * Phase 7.1 · Course Context strip for reading pages.
 *
 * Given a knowledge-scoped reading docId (`know/<cat>__<file>`), fetches
 * the best-matching syllabus schema through `loom://native/schema-for-doc`
 * and renders a thin, sparse strip at the top of the reading page:
 *
 *     Course: FINS 3640 · Investments · T1 2026 · Mathieu Fournier
 *     Midterm · 35% · 18 Oct  |  Final · 35% · TBD  |  …
 *
 * Click a chip to edit inline; blur persists the correction through
 * the sidecar (native bridge → Swift `SchemaCorrectionsStore.append`,
 * or `/api/schema-corrections` in dev / browser).
 *
 * Design discipline (plan §3 + `feedback_vellum_polish_rules`):
 *   - Eyebrow uses serif smallCaps (`Course`), body uses display serif
 *     with oldstyle numerals for percents / dates.
 *   - Hidden entirely when no schema is attached — never renders a
 *     "no course context" placeholder (plan §7.1 gate 1).
 *   - Read-only by default; edits are user-initiated only.
 *   - No AI calls, no quizzes, no examiner flows — respects the
 *     curiosity-led arrow.
 *
 * Future phases (7.2 / 7.3) will consume the same schema payload for
 * Pursuit seeding and passive anchor projection.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSchemaForReadingDoc, type SchemaCorrection, type SchemaRecord } from '../lib/loom-schema-records';
import { appendSchemaCorrection } from '../lib/schema-corrections-client';

type FieldFound<T> = { status: 'found'; value: T; confidence?: number; sourceSpans?: SourceSpan[] };
type FieldNotFound = { status: 'not_found'; tried?: string[] };
type FieldResult<T> = FieldFound<T> | FieldNotFound | { status: string; value?: T; userCorrected?: boolean };

type SourceSpan = {
  docId?: string;
  quote?: string;
  pageNum?: number;
  verified?: boolean;
};

type Teacher = {
  role: FieldResult<string>;
  name: FieldResult<string>;
  email: FieldResult<string>;
};

type Assessment = {
  name: FieldResult<string>;
  weightPercent: FieldResult<number>;
  dueDate: FieldResult<string>;
  format: FieldResult<string>;
};

type SyllabusSchema = {
  courseCode: FieldResult<string>;
  courseName: FieldResult<string>;
  term: FieldResult<string>;
  institution: FieldResult<string>;
  textbook?: FieldResult<string>;
  officeHours?: FieldResult<string>;
  teachers: Teacher[];
  assessmentItems: Assessment[];
  learningObjectives?: FieldResult<string>[];
  weekTopics?: unknown[];
};

type ChipProps = {
  label: string;
  value: string | null;
  pageNum?: number | null;
  editable?: boolean;
  editing?: boolean;
  saving?: boolean;
  userCorrected?: boolean;
  onRequestEdit?: () => void;
  onCancelEdit?: () => void;
  onCommit?: (next: string) => void;
};

export function CourseContextStrip({ docId }: { docId: string }) {
  const [record, setRecord] = useState<SchemaRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initial fetch + refresh on docId change.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setRecord(null);
    setEditingField(null);
    setSavingField(null);
    setErrorMessage(null);
    if (!docId) {
      setDismissed(false);
      setRecord(null);
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    const wasDismissed = readDismissed(docId);
    setDismissed(wasDismissed);
    if (wasDismissed) {
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const next = await loadSchemaForReadingDoc(docId);
      if (!cancelled) {
        setRecord(next);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const corrected = useMemo<SyllabusSchema | null>(() => {
    if (!record || !record.schema) return null;
    if (record.extractorId !== 'syllabus-pdf') return null;
    return applyCorrections(record.schema as SyllabusSchema, record.corrections);
  }, [record]);

  const handleCommit = useCallback(
    async (fieldPath: string, next: string) => {
      if (!record) return;
      const original = readCurrent(record.schema as SyllabusSchema, fieldPath);
      const current = readCurrent(corrected, fieldPath);
      const trimmedNext = next.trim();
      if (!trimmedNext) {
        setEditingField(null);
        setErrorMessage(null);
        return;
      }
      if (trimmedNext === (current ?? '')) {
        setEditingField(null);
        setErrorMessage(null);
        return;
      }
      setSavingField(fieldPath);
      setErrorMessage(null);
      try {
        const corrections = await appendSchemaCorrection({
          extractorId: record.extractorId,
          sourceDocId: record.sourceDocId,
          fieldPath,
          newValue: trimmedNext,
          originalValue: current ?? original ?? '',
        });
        setRecord({ ...record, corrections });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
      } finally {
        setSavingField(null);
        setEditingField(null);
      }
    },
    [corrected, record],
  );

  if (dismissed || !loaded || !record || !corrected) return null;

  const courseCode = fieldValue(corrected.courseCode);
  const courseName = fieldValue(corrected.courseName);
  const term = fieldValue(corrected.term);
  const institution = fieldValue(corrected.institution);
  const primaryTeacher = corrected.teachers?.[0];
  const teacherName = primaryTeacher ? fieldValue(primaryTeacher.name) : null;

  // First line chips — identity + people.
  const headerChips: Array<{ path: string; label: string; value: string | null; editable?: boolean; pageNum?: number | null; userCorrected?: boolean; }> = [
    {
      path: 'courseCode',
      label: 'Code',
      value: courseCode,
      editable: true,
      pageNum: firstPage(corrected.courseCode),
      userCorrected: isUserCorrected(corrected.courseCode),
    },
    {
      path: 'courseName',
      label: 'Name',
      value: courseName,
      editable: true,
      pageNum: firstPage(corrected.courseName),
      userCorrected: isUserCorrected(corrected.courseName),
    },
    {
      path: 'term',
      label: 'Term',
      value: term,
      editable: true,
      pageNum: firstPage(corrected.term),
      userCorrected: isUserCorrected(corrected.term),
    },
    {
      path: 'institution',
      label: 'Institution',
      value: institution,
      editable: true,
      pageNum: firstPage(corrected.institution),
      userCorrected: isUserCorrected(corrected.institution),
    },
    ...(primaryTeacher
      ? [
          {
            path: 'teachers[0].name',
            label: 'Lecturer',
            value: teacherName,
            editable: true,
            pageNum: firstPage(primaryTeacher.name),
            userCorrected: isUserCorrected(primaryTeacher.name),
          },
        ]
      : []),
  ];

  // Don't render the strip at all when every identifying field is missing.
  const hasAny = headerChips.some((c) => c.value != null && c.value !== '');
  const assessments = corrected.assessmentItems ?? [];
  if (!hasAny && assessments.length === 0) return null;

  return (
    <aside className="loom-course-context-strip" aria-label="Course Context">
      <div className="loom-course-context-header">
        <span className="loom-course-context-eyebrow">Course</span>
        <div className="loom-course-context-row">
          {headerChips
            .filter((c) => c.value != null || c.editable)
            .map((chip, idx, list) => (
              <span key={chip.path} className="loom-course-context-chip-wrap">
                <Chip
                  label={chip.label}
                  value={chip.value}
                  editable={chip.editable}
                  editing={editingField === chip.path}
                  saving={savingField === chip.path}
                  pageNum={chip.pageNum}
                  userCorrected={chip.userCorrected}
                  onRequestEdit={() => {
                    setEditingField(chip.path);
                    setErrorMessage(null);
                  }}
                  onCancelEdit={() => setEditingField(null)}
                  onCommit={(next) => void handleCommit(chip.path, next)}
                />
                {idx < list.length - 1 && <span className="loom-course-context-sep">·</span>}
              </span>
            ))}
        </div>
        <button
          type="button"
          className="loom-course-context-dismiss"
          aria-label="Dismiss course context"
          onClick={() => {
            writeDismissed(docId);
            setDismissed(true);
            setRecord(null);
          }}
        >
          ×
        </button>
      </div>

      {assessments.length > 0 && (
        <div className="loom-course-context-assessments">
          {assessments.map((item, idx) => {
            const name = fieldValue(item.name);
            const weight = fieldValue(item.weightPercent);
            const due = fieldValue(item.dueDate);
            if (!name && weight == null && !due) return null;
            return (
              <span key={idx} className="loom-course-context-assess">
                {name && (
                  <EditableText
                    value={name}
                    saving={savingField === `assessmentItems[${idx}].name`}
                    editing={editingField === `assessmentItems[${idx}].name`}
                    userCorrected={isUserCorrected(item.name)}
                    onRequestEdit={() => {
                      setEditingField(`assessmentItems[${idx}].name`);
                      setErrorMessage(null);
                    }}
                    onCancelEdit={() => setEditingField(null)}
                    onCommit={(next) => void handleCommit(`assessmentItems[${idx}].name`, next)}
                  />
                )}
                {weight != null && (
                  <span className="loom-course-context-weight"> · {weight}%</span>
                )}
                {due && (
                  <span className="loom-course-context-due"> · {due}</span>
                )}
                {idx < assessments.length - 1 && (
                  <span className="loom-course-context-pipe" aria-hidden>
                    |
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {errorMessage && (
        <div className="loom-course-context-error" role="status">
          {errorMessage}
        </div>
      )}

      <style jsx>{`
        .loom-course-context-strip {
          margin: 0 0 1.4rem;
          padding: 0.7rem 0.95rem;
          border-top: 0.5px solid var(--mat-border);
          border-bottom: 0.5px solid var(--mat-border);
          font-family: var(--serif);
          color: var(--fg-secondary);
          font-variant-numeric: oldstyle-nums proportional-nums;
          background: linear-gradient(
            180deg,
            color-mix(in srgb, var(--accent) 3%, transparent) 0%,
            transparent 100%
          );
        }
        .loom-course-context-header {
          display: flex;
          align-items: baseline;
          gap: 0.7rem;
          flex-wrap: wrap;
        }
        .loom-course-context-eyebrow {
          font-family: var(--serif);
          font-variant: small-caps;
          text-transform: lowercase;
          letter-spacing: 0.04em;
          font-style: italic;
          font-size: var(--fs-caption);
          color: var(--muted);
          flex-shrink: 0;
        }
        .loom-course-context-row {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 0.35rem;
          min-width: 0;
        }
        .loom-course-context-chip-wrap {
          display: inline-flex;
          align-items: baseline;
          gap: 0.35rem;
        }
        .loom-course-context-sep {
          color: var(--muted);
          opacity: 0.55;
        }
        .loom-course-context-assessments {
          margin-top: 0.5rem;
          font-family: var(--serif);
          font-size: var(--fs-small);
          color: var(--fg-secondary);
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 0.15rem 0.45rem;
          font-variant-numeric: oldstyle-nums proportional-nums;
        }
        .loom-course-context-assess {
          display: inline-flex;
          align-items: baseline;
          gap: 0.2rem;
        }
        .loom-course-context-weight,
        .loom-course-context-due {
          color: var(--fg-secondary);
        }
        .loom-course-context-pipe {
          color: var(--muted);
          opacity: 0.45;
          margin: 0 0.4rem;
        }
        .loom-course-context-error {
          margin-top: 0.35rem;
          font-family: var(--serif);
          font-size: var(--fs-caption);
          color: color-mix(in srgb, #a3433a 82%, var(--fg));
          font-style: italic;
        }
        .loom-course-context-dismiss {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font: inherit;
          font-size: var(--fs-small);
          line-height: 1;
          padding: 0.1rem 0.2rem;
          border-radius: 2px;
        }
        .loom-course-context-dismiss:hover {
          color: var(--fg);
          background: color-mix(in srgb, var(--fg) 6%, transparent);
        }
      `}</style>
    </aside>
  );
}

function Chip({
  label,
  value,
  editable = false,
  editing = false,
  saving = false,
  userCorrected = false,
  pageNum,
  onRequestEdit,
  onCancelEdit,
  onCommit,
}: ChipProps) {
  const hasValue = value != null && value !== '';
  return (
    <span className="loom-course-context-chip">
      <span className="loom-course-context-chip-label">{label}</span>
      {editing ? (
        <InlineInput
          initialValue={value ?? ''}
          saving={saving}
          onCommit={(next) => onCommit?.(next)}
          onCancel={() => onCancelEdit?.()}
        />
      ) : (
        <button
          type="button"
          className={`loom-course-context-chip-value ${hasValue ? '' : 'is-empty'} ${userCorrected ? 'is-corrected' : ''}`}
          disabled={!editable || saving}
          onClick={() => editable && onRequestEdit?.()}
          title={editable ? 'Edit' : undefined}
        >
          {hasValue ? value : <em>not found</em>}
        </button>
      )}
      {pageNum != null && hasValue && (
        <span className="loom-course-context-page" aria-label={`Source page ${pageNum}`}>
          p. {pageNum}
        </span>
      )}
      <style jsx>{`
        .loom-course-context-chip {
          display: inline-flex;
          align-items: baseline;
          gap: 0.25rem;
          font-family: var(--serif);
          font-size: var(--fs-small);
        }
        .loom-course-context-chip-label {
          font-family: var(--serif);
          font-variant: small-caps;
          text-transform: lowercase;
          letter-spacing: 0.03em;
          color: var(--muted);
          font-size: var(--fs-caption);
        }
        .loom-course-context-chip-value {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: var(--fg);
          text-align: left;
          cursor: pointer;
          border-radius: 2px;
        }
        .loom-course-context-chip-value:hover:not(:disabled) {
          color: var(--accent);
        }
        .loom-course-context-chip-value:disabled {
          cursor: default;
        }
        .loom-course-context-chip-value.is-empty {
          color: var(--muted);
          font-style: italic;
        }
        .loom-course-context-chip-value.is-corrected::after {
          content: '';
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent);
          margin-left: 0.3rem;
          vertical-align: middle;
          opacity: 0.7;
        }
        .loom-course-context-page {
          font-family: var(--serif);
          font-size: var(--fs-caption);
          color: var(--muted);
          font-variant-numeric: oldstyle-nums;
          font-style: italic;
          margin-left: 0.15rem;
        }
      `}</style>
    </span>
  );
}

function EditableText({
  value,
  editing = false,
  saving = false,
  userCorrected = false,
  onRequestEdit,
  onCancelEdit,
  onCommit,
}: {
  value: string;
  editing?: boolean;
  saving?: boolean;
  userCorrected?: boolean;
  onRequestEdit?: () => void;
  onCancelEdit?: () => void;
  onCommit?: (next: string) => void;
}) {
  if (editing) {
    return (
      <InlineInput
        initialValue={value}
        saving={saving}
        onCommit={(next) => onCommit?.(next)}
        onCancel={() => onCancelEdit?.()}
      />
    );
  }
  return (
    <button
      type="button"
      className={`loom-course-context-editable ${userCorrected ? 'is-corrected' : ''}`}
      onClick={() => onRequestEdit?.()}
      disabled={saving}
      title="Edit"
    >
      {value}
      <style jsx>{`
        .loom-course-context-editable {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: var(--fg);
          text-align: left;
          cursor: pointer;
        }
        .loom-course-context-editable:hover:not(:disabled) {
          color: var(--accent);
        }
        .loom-course-context-editable.is-corrected::after {
          content: '';
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent);
          margin-left: 0.25rem;
          vertical-align: middle;
          opacity: 0.7;
        }
      `}</style>
    </button>
  );
}

function InlineInput({
  initialValue,
  saving,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  saving?: boolean;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelledRef = useRef(false);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <input
      ref={inputRef}
      className="loom-course-context-input"
      defaultValue={initialValue}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (!cancelledRef.current) onCommit(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelledRef.current = true;
          onCancel();
        }
      }}
      style={{
        font: 'inherit',
        fontFamily: 'var(--serif)',
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: 'none',
        borderBottom: '0.5px solid var(--accent)',
        padding: '0 0.2rem',
        color: 'var(--fg)',
        outline: 'none',
        minWidth: '6rem',
        borderRadius: '2px 2px 0 0',
      }}
    />
  );
}

function dismissKey(docId: string): string {
  return `loom:course-context-dismissed:${docId}`;
}

function readDismissed(docId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(dismissKey(docId)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(docId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(dismissKey(docId), '1');
  } catch {
    // Ignore private browsing / storage-denied cases; dismissal still
    // applies to the current mounted component through local state.
  }
}

function applyCorrections(schema: SyllabusSchema, corrections: SchemaCorrection[]): SyllabusSchema {
  if (!corrections.length) return schema;
  // Deep clone — schemas are small + fully JSON-serialisable.
  const next = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  for (const c of corrections) {
    applyAt(next, c.fieldPath, c.corrected);
  }
  return next as SyllabusSchema;
}

function applyAt(root: Record<string, unknown>, fieldPath: string, corrected: string): void {
  const segments = parsePath(fieldPath);
  if (!segments.length) return;
  let container: Record<string, unknown> | unknown[] = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const nextContainer = seg.kind === 'index'
      ? (container as unknown[])[seg.index]
      : (container as Record<string, unknown>)[seg.name];
    if (nextContainer === undefined || nextContainer === null || typeof nextContainer !== 'object') return;
    container = nextContainer as Record<string, unknown> | unknown[];
  }
  const tail = segments[segments.length - 1];
  const host =
    tail.kind === 'index'
      ? (container as unknown[])[tail.index]
      : (container as Record<string, unknown>)[tail.name];
  if (host && typeof host === 'object' && !Array.isArray(host)) {
    (host as Record<string, unknown>).status = 'found';
    (host as Record<string, unknown>).value = corrected;
    (host as Record<string, unknown>).userCorrected = true;
  } else if (tail.kind === 'index') {
    (container as unknown[])[tail.index] = corrected;
  } else {
    (container as Record<string, unknown>)[tail.name] = corrected;
  }
}

type PathSegment =
  | { kind: 'name'; name: string }
  | { kind: 'index'; index: number };

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const re = /([^\.\[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push({ kind: 'name', name: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ kind: 'index', index: Number(match[2]) });
    }
  }
  return segments;
}

function readCurrent(schema: SyllabusSchema | null, fieldPath: string): string | null {
  if (!schema) return null;
  const segments = parsePath(fieldPath);
  let cursor: unknown = schema;
  for (const seg of segments) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') return null;
    cursor = seg.kind === 'index'
      ? (cursor as unknown[])[seg.index]
      : (cursor as Record<string, unknown>)[seg.name];
  }
  if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
    const host = cursor as { status?: string; value?: unknown };
    if (host.status === 'found' && host.value != null) {
      return String(host.value);
    }
    return null;
  }
  if (cursor == null) return null;
  return String(cursor);
}

function fieldValue<T>(field: FieldResult<T> | undefined | null): T | null {
  if (!field) return null;
  if (field.status === 'found' && (field as FieldFound<T>).value !== undefined) {
    return (field as FieldFound<T>).value;
  }
  // Some `userCorrected` entries don't declare a strict `found` status —
  // fall through to the value when present.
  if ('value' in field && (field as { value?: T }).value != null) {
    return (field as { value?: T }).value ?? null;
  }
  return null;
}

function firstPage<T>(field: FieldResult<T> | undefined | null): number | null {
  if (!field) return null;
  if (field.status !== 'found') return null;
  const spans = (field as FieldFound<T>).sourceSpans ?? [];
  const page = spans.find((s) => typeof s?.pageNum === 'number')?.pageNum;
  return typeof page === 'number' ? page : null;
}

function isUserCorrected<T>(field: FieldResult<T> | undefined | null): boolean {
  if (!field || typeof field !== 'object') return false;
  return Boolean((field as { userCorrected?: boolean }).userCorrected);
}
