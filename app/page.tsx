import Link from 'next/link';

export default function Home() {
  return (
    <div className="prose-notion">
      <h1>📚 LLM Wiki</h1>
      <p style={{ color: 'var(--muted)', fontSize: '1.05rem' }}>
        A Notion-style knowledge base for learning Large Language Models, built from
        Andrej Karpathy&apos;s <a href="https://github.com/karpathy/LLM101n">LLM101n</a> course
        and <a href="https://www.youtube.com/playlist?list=PLAqhIrjkxbuWI23v9cThsA9GvCAUhRvKZ">Neural Networks: Zero to Hero</a> series.
      </p>
      <h2>Features</h2>
      <ul>
        <li>📐 LaTeX math via KaTeX</li>
        <li>📄 Embedded PDFs (papers)</li>
        <li>🎬 Embedded YouTube lectures</li>
        <li>🎛️ Interactive React widgets inside MDX</li>
        <li>🌙 Notion-style layout</li>
      </ul>
      <h2>Start here</h2>
      <ul>
        <li><Link href="/demo">→ Feature demo page</Link></li>
        <li><Link href="/wiki/llm101n">→ LLM101n syllabus overview</Link></li>
        <li><Link href="/wiki/micrograd">→ Chapter 1: Micrograd</Link></li>
      </ul>
      <hr />
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
        Phase 1 scaffold complete. Run <code>npm install &amp;&amp; npm run dev</code> then visit <code>http://localhost:3000</code>.
        Phase 2 will populate all chapter pages from researched content.
      </p>
    </div>
  );
}
