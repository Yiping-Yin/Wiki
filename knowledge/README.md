# Knowledge corpus

Drop any `.md`, `.mdx`, or `.txt` files (recursively, in any subfolder structure) into this directory and they will be automatically:

1. **Indexed by `npx tsx scripts/build-atlas.ts`** — embedded locally with `Xenova/all-MiniLM-L6-v2` (no API key needed), reduced via UMAP, clustered, and added to `/atlas` as colored points.
2. **Picked up by `/api/ask` (RAG chat)** — the assistant can cite them alongside wiki chapters.
3. **Searchable via Pagefind** after `npm run build`.

## File format

The first `# Heading` in each file becomes its title in the atlas. Otherwise the filename is used.

```
knowledge/
├── papers/
│   ├── attention-is-all-you-need.md
│   └── flash-attention.md
├── notes/
│   └── meeting-2025-04-08.md
└── books/
    └── deep-learning-goodfellow-ch5.md
```

## Rebuilding the atlas

```bash
# regenerate after adding/removing files
npx tsx scripts/build-atlas.ts

# skip the cluster-labelling step (faster, no claude CLI calls)
npx tsx scripts/build-atlas.ts --no-labels
```

The first run downloads ~25MB of model weights into `~/.cache/huggingface`. Subsequent runs are fast.
