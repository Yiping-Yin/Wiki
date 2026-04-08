'use client';
/**
 * D3 force-directed graph of all docs in the corpus.
 * Nodes pulled from search-index.json (label + href + category).
 * Edges pulled from related.json (top-3 nearest neighbors per doc).
 * Click → navigate. Drag → reposition. Scroll → zoom.
 */
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

type DocNode = {
  id: string;
  title: string;
  href: string;
  category: string;
  x?: number; y?: number;
  fx?: number | null; fy?: number | null;
};
type Edge = { source: string; target: string };

const CAT_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ec4899', '#ef4444', '#3b82f6', '#a78bfa',
  '#fb7185', '#22d3ee', '#84cc16', '#f97316',
];

export function ForceGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [searchRes, relatedRes] = await Promise.all([
          fetch('/search-index.json'),
          fetch('/related.json'),
        ]);
        if (!searchRes.ok) throw new Error('search index missing');
        const searchPayload = await searchRes.json();
        const related = relatedRes.ok ? await relatedRes.json() : {};

        const stored = searchPayload.index?.storedFields ?? {};
        const docIds = searchPayload.index?.documentIds ?? {};
        const nodes: DocNode[] = [];
        const idByInternal: Record<string, string> = {};
        for (const [internal, fields] of Object.entries<any>(stored)) {
          const id = docIds[internal];
          if (!id || !fields?.title || !fields?.href) continue;
          idByInternal[internal] = id;
          nodes.push({
            id,
            title: fields.title,
            href: fields.href,
            category: fields.category ?? '',
          });
        }
        if (nodes.length === 0) throw new Error('no nodes');

        // Edges from related.json (top-3 per node)
        const idSet = new Set(nodes.map((n) => n.id));
        const edges: Edge[] = [];
        for (const [src, list] of Object.entries<any>(related)) {
          if (!idSet.has(src)) continue;
          for (const r of (list as any[]).slice(0, 3)) {
            if (idSet.has(r.id) && r.id !== src) {
              edges.push({ source: src, target: r.id });
            }
          }
        }

        if (cancelled || !svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const w = svg.node()!.clientWidth;
        const h = svg.node()!.clientHeight;

        // Category → color
        const cats = Array.from(new Set(nodes.map((n) => n.category)));
        const colorOf = (cat: string) => CAT_COLORS[cats.indexOf(cat) % CAT_COLORS.length];

        svg.selectAll('*').remove();

        const container = svg.append('g');
        svg.call(
          d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.2, 4])
            .on('zoom', (e) => container.attr('transform', e.transform.toString())) as any,
        );

        const sim = d3.forceSimulation(nodes as any)
          .force('link', d3.forceLink<DocNode, any>(edges).id((d: any) => d.id).distance(60).strength(0.4))
          .force('charge', d3.forceManyBody().strength(-90))
          .force('center', d3.forceCenter(w / 2, h / 2))
          .force('collision', d3.forceCollide().radius(8));

        const link = container.append('g')
          .selectAll('line')
          .data(edges)
          .join('line')
          .attr('stroke', '#374151')
          .attr('stroke-opacity', 0.4)
          .attr('stroke-width', 0.7);

        const node = container.append('g')
          .selectAll<SVGCircleElement, DocNode>('circle')
          .data(nodes)
          .join('circle')
          .attr('r', 4)
          .attr('fill', (d) => colorOf(d.category))
          .attr('stroke', '#0a0a0f')
          .attr('stroke-width', 0.8)
          .style('cursor', 'pointer')
          .on('click', (_e, d) => { window.location.href = d.href; })
          .on('mouseover', function (_e, d) {
            d3.select(this).attr('r', 8).attr('stroke-width', 1.5);
            tooltip.style('display', 'block').text(d.title);
          })
          .on('mousemove', function (e) {
            const rect = svgRef.current!.getBoundingClientRect();
            tooltip
              .style('left', `${e.clientX - rect.left + 12}px`)
              .style('top', `${e.clientY - rect.top + 12}px`);
          })
          .on('mouseout', function () {
            d3.select(this).attr('r', 4).attr('stroke-width', 0.8);
            tooltip.style('display', 'none');
          })
          .call(d3.drag<SVGCircleElement, DocNode>()
            .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any,
          );

        const tooltip = d3.select(svgRef.current.parentElement)
          .append('div')
          .style('position', 'absolute')
          .style('display', 'none')
          .style('background', 'rgba(15,17,21,0.95)')
          .style('color', '#fff')
          .style('padding', '4px 10px')
          .style('border-radius', '6px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('z-index', '20');

        sim.on('tick', () => {
          link
            .attr('x1', (d: any) => d.source.x)
            .attr('y1', (d: any) => d.source.y)
            .attr('x2', (d: any) => d.target.x)
            .attr('y2', (d: any) => d.target.y);
          node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
        });

        // Legend
        const legend = svg.append('g').attr('transform', 'translate(14,14)');
        cats.slice(0, 12).forEach((c, i) => {
          const g = legend.append('g').attr('transform', `translate(0, ${i * 16})`);
          g.append('circle').attr('r', 4).attr('cx', 4).attr('cy', 4).attr('fill', colorOf(c));
          g.append('text').text(c.length > 28 ? c.slice(0, 26) + '…' : c)
            .attr('x', 12).attr('y', 8)
            .attr('font-size', 10).attr('fill', '#9ca3af')
            .attr('font-family', 'Inter, sans-serif');
        });

        setCount(nodes.length);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 80px)', background: 'radial-gradient(ellipse at center, #0a0e18 0%, #000 100%)' }}>
      {error && <div style={{ position: 'absolute', top: 16, right: 16, color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>}
      {count > 0 && (
        <div style={{ position: 'absolute', top: 16, right: 16, color: '#9ca3af', fontSize: '0.78rem', background: 'rgba(15,17,21,0.85)', padding: '4px 10px', borderRadius: 6 }}>
          {count} nodes · drag · scroll-zoom · click
        </div>
      )}
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
