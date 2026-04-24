import LetterClient from '../LetterClient';

// M13 — Letter. Reserved correspondence chapter.
//
// There is no recipient/note/delivery object yet. The route therefore
// stays honest: it shows an empty gate when no held panels exist, and at
// most a latest-panel preview when panel data is mirrored.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-actions.jsx → LetterSurface

export const metadata = { title: 'Letter · Loom' };

export default function LetterPage() {
  return <LetterClient />;
}
