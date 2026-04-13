/**
 * Loom · doc context derivation.
 *
 * Single source of truth for "what doc is the user looking at right now?"
 * given a pathname. Used by ChatFocus / Review / LiveArtifact to bind the
 * right trace, and by SelectionWarp to dispatch quotes into the current
 * source context.
 *
 * Three doc-context shapes:
 *   - wiki/<slug>           a wiki chapter
 *   - know/<cat>__<file>    a knowledge-base document
 *   - upload/<name>         an uploaded source document
 *   - free/<YYYY-MM-DD>     non-doc surfaces (today, kesi, home, …)
 */

export type DocContext = {
  docId: string;
  href: string;
  sourceTitle: string;
  /** True for free/<date> mode (no source document attached). */
  isFree: boolean;
};

export function contextFromPathname(pathname: string): DocContext {
  const wiki = pathname.match(/^\/wiki\/([^/?#]+)/);
  if (wiki) {
    const slug = wiki[1];
    return {
      docId: `wiki/${slug}`,
      href: `/wiki/${slug}`,
      sourceTitle: prettifySlug(slug),
      isFree: false,
    };
  }
  const know = pathname.match(/^\/knowledge\/([^/?#]+)\/([^/?#]+)/);
  if (know) {
    const cat = know[1], file = know[2];
    return {
      docId: `know/${cat}__${file}`,
      href: `/knowledge/${cat}/${file}`,
      sourceTitle: prettifySlug(file),
      isFree: false,
    };
  }
  const upload = pathname.match(/^\/uploads\/([^/?#]+)/);
  if (upload) {
    const name = decodeURIComponent(upload[1]);
    return {
      docId: `upload/${name}`,
      href: `/uploads/${encodeURIComponent(name)}`,
      sourceTitle: prettifySlug(name.replace(/\.[^.]+$/, '')),
      isFree: false,
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    docId: `free/${today}`,
    href: pathname,
    sourceTitle: `Free thinking · ${today}`,
    isFree: true,
  };
}

function prettifySlug(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
