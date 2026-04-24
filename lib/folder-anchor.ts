/** Turn a folder fullPath like "Week / Week 1" into a URL-safe id that
 *  survives the browser's native URL-fragment decoding: no %, no spaces.
 *
 *  The earlier approach used `encodeURIComponent(fullPath)` for both the id
 *  attribute and the URL hash — but browsers DECODE the fragment before
 *  matching it against an element's id, so `#Week%20%2F%20Week%201` decoded
 *  to "Week / Week 1" while the id was still literally "Week%20%2F%20Week%201",
 *  and the two never matched. A clean alphanumeric slug avoids the problem. */
export function folderPathToId(fullPath: string): string {
  if (fullPath === '_root') return 'folder-root';
  return (
    'folder-' +
    fullPath
      .toLowerCase()
      .replace(/\s*\/\s*/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
  );
}
