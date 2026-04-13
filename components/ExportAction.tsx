'use client';
/**
 * ExportAction · global export handler.
 * Listens for loom:export event and downloads all notes as JSON.
 * Triggered by ⌘P → "Export Notes".
 */
import { useEffect } from 'react';
import { traceStore } from '../lib/trace/store';
import { notesFromTraces } from '../lib/note/from-trace';
import { notesToJson, notesToMarkdown, downloadFile } from '../lib/note/export';

export function ExportAction() {
  useEffect(() => {
    const handler = async (e: Event) => {
      const format = (e as CustomEvent).detail?.format ?? 'json';
      try {
        const traces = await traceStore.getAll();
        const notes = notesFromTraces(traces);
        const date = new Date().toISOString().slice(0, 10);
        if (format === 'markdown') {
          const md = notesToMarkdown(notes);
          downloadFile(md, `loom-notes-${date}.md`, 'text/markdown;charset=utf-8');
        } else {
          const json = notesToJson(notes);
          downloadFile(json, `loom-notes-${date}.json`, 'application/json;charset=utf-8');
        }
      } catch (err) {
        console.error('Export failed:', err);
      }
    };
    window.addEventListener('loom:export', handler);
    return () => window.removeEventListener('loom:export', handler);
  }, []);

  return null;
}
