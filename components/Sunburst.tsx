'use client';
/**
 * Zoomable D3 sunburst over the entire corpus.
 *
 * Hierarchy: root → source (Knowledge / LLM Reference) → category → doc
 * Click a slice to zoom in. Click center to zoom out one level.
 * Color by category. Hover to see breadcrumb + doc count.
 */
import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

type DocMeta = { title: string; href: string; category: string };
type Node = {
  name: string;
  href?: string;
  children?: Node[];
  value?: number;
};

const PALETTE = [
  '#0071e3', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#06b6d4',
  '#8b5cf6', '#f97316', '#84cc16', '#3b82f6', '#dc2626', '#0ea5e9',
];

export function Sunburst() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch('/search-index.json');
      if (!r.ok) return;
      const payload = await r.json();
      const stored = payload.index?.storedFields ?? {};
      const docs: DocMeta[] = [];
      for (const [, fields] of Object.entries<any>(stored)) {
        if (!fields?.title || !fields?.href) continue;
        docs.push({
          title: fields.title,
          href: fields.href,
          category: fields.category ?? 'Misc',
        });
      }
      if (cancelled) return;
      setCount(docs.length);
      buildSunburst(docs);
    })();
    return () => { cancelled = true; };

    function buildSunburst(docs: DocMeta[]) {
      const wikiDocs = docs.filter((d) => d.href.startsWith('/wiki/'));
      const knowDocs = docs.filter((d) => d.href.startsWith('/knowledge/'));

      // Group by category
      const groupBy = (arr: DocMeta[]): Node[] => {
        const map = new Map<string, DocMeta[]>();
        for (const d of arr) {
          if (!map.has(d.category)) map.set(d.category, []);
          map.get(d.category)!.push(d);
        }
        return Array.from(map.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([cat, items]) => ({
            name: cat,
            children: items.map((d) => ({ name: d.title, href: d.href, value: 1 })),
          }));
      };

      const root: Node = {
        name: 'My Wiki',
        children: [
          { name: 'Knowledge', children: groupBy(knowDocs) },
          { name: 'LLM Reference', children: groupBy(wikiDocs) },
        ],
      };

      const svg = d3.select(svgRef.current!);
      const W = svg.node()!.clientWidth;
      const H = svg.node()!.clientHeight;
      const radius = Math.min(W, H) / 2 - 20;

      svg.selectAll('*').remove();

      const g = svg
        .append('g')
        .attr('transform', `translate(${W / 2},${H / 2})`);

      const hierarchy = d3.hierarchy(root)
        .sum((d: any) => d.value ?? 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

      const partition = d3.partition<Node>().size([2 * Math.PI, hierarchy.height + 1]);
      const rootNode: any = partition(hierarchy);
      rootNode.each((d: any) => (d.current = d));

      // Color by top-level category
      const allCats = new Set<string>();
      rootNode.descendants().forEach((d: any) => {
        if (d.depth === 2) allCats.add(d.data.name);
      });
      const catList = Array.from(allCats);
      const colorOf = (catName: string) => PALETTE[catList.indexOf(catName) % PALETTE.length];
      const colorForNode = (d: any): string => {
        if (d.depth === 0) return 'transparent';
        if (d.depth === 1) return d.data.name === 'Knowledge' ? '#0071e3' : '#a855f7';
        let cur = d;
        while (cur.depth > 2) cur = cur.parent;
        return colorOf(cur.data.name);
      };

      const arc = d3.arc<any>()
        .startAngle((d) => d.x0)
        .endAngle((d) => d.x1)
        .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(radius * 1.5)
        .innerRadius((d) => d.y0 * radius / (hierarchy.height + 1))
        .outerRadius((d) => Math.max(d.y0 * radius / (hierarchy.height + 1), d.y1 * radius / (hierarchy.height + 1) - 1));

      // Slices
      const path = g.append('g')
        .selectAll('path')
        .data(rootNode.descendants().slice(1))
        .join('path')
        .attr('fill', (d: any) => colorForNode(d))
        .attr('fill-opacity', (d: any) => arcVisible(d.current) ? (d.children ? 0.85 : 0.6) : 0)
        .attr('pointer-events', (d: any) => arcVisible(d.current) ? 'auto' : 'none')
        .attr('d', (d: any) => arc(d.current))
        .style('cursor', 'pointer')
        .on('mouseover', function (_e, d: any) {
          d3.select(this).attr('fill-opacity', d.children ? 1 : 0.85);
          const path: string[] = [];
          let n = d;
          while (n) { path.unshift(n.data.name); n = n.parent; }
          const counts = d.value ? ` · ${d.value} doc${d.value === 1 ? '' : 's'}` : '';
          setHover(path.join(' / ') + counts);
        })
        .on('mouseout', function (_e, d: any) {
          d3.select(this).attr('fill-opacity', d.children ? 0.85 : 0.6);
          setHover(null);
        })
        .on('click', (_e, p: any) => {
          if (!p.children && p.data.href) {
            window.location.href = p.data.href;
            return;
          }
          clicked(_e, p);
        });

      // Labels
      const label = g.append('g')
        .attr('pointer-events', 'none')
        .attr('text-anchor', 'middle')
        .style('user-select', 'none')
        .selectAll('text')
        .data(rootNode.descendants().slice(1))
        .join('text')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('fill-opacity', (d: any) => +labelVisible(d.current))
        .attr('transform', (d: any) => labelTransform(d.current))
        .attr('font-size', (d: any) => d.depth === 1 ? 13 : d.depth === 2 ? 10 : 8)
        .attr('font-weight', (d: any) => d.depth <= 2 ? 600 : 400)
        .text((d: any) => {
          const t = d.data.name;
          if (d.depth === 1) return t;
          if (d.depth === 2) return t.length > 18 ? t.slice(0, 16) + '…' : t;
          return t.length > 14 ? t.slice(0, 12) + '…' : t;
        });

      // Center button — zoom out
      const parent = g.append('circle')
        .datum(rootNode)
        .attr('r', radius / (hierarchy.height + 1))
        .attr('fill', 'rgba(255,255,255,0.05)')
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('pointer-events', 'all')
        .style('cursor', 'pointer')
        .on('click', clicked);

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', 'rgba(255,255,255,0.6)')
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .style('pointer-events', 'none')
        .text('My Wiki');

      function clicked(_event: any, p: any) {
        parent.datum(p.parent || rootNode);
        rootNode.each((d: any) => (d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth),
        }));

        const t = g.transition().duration(700).ease(d3.easeCubicInOut);
        path.transition(t as any)
          .tween('data', (d: any) => {
            const i = d3.interpolate(d.current, d.target);
            return (tt) => (d.current = i(tt));
          })
          .filter(function (d: any) {
            return +(this as any).getAttribute('fill-opacity') > 0 || arcVisible(d.target);
          })
          .attr('fill-opacity', (d: any) => arcVisible(d.target) ? (d.children ? 0.85 : 0.6) : 0)
          .attr('pointer-events', (d: any) => arcVisible(d.target) ? 'auto' : 'none')
          .attrTween('d', (d: any) => () => arc(d.current) as any);

        label.filter(function (d: any) {
          return +(this as any).getAttribute('fill-opacity') > 0 || labelVisible(d.target);
        }).transition(t as any)
          .attr('fill-opacity', (d: any) => +labelVisible(d.target))
          .attrTween('transform', (d: any) => () => labelTransform(d.current));
      }

      function arcVisible(d: any) {
        return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
      }
      function labelVisible(d: any) {
        return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
      }
      function labelTransform(d: any) {
        const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
        const y = (d.y0 + d.y1) / 2 * radius / (hierarchy.height + 1);
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
      }
    }
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 80px)', background: 'radial-gradient(ellipse at center, #0a0e18 0%, #000 100%)' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      {hover && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(28,28,30,0.92)', color: '#fff',
          padding: '0.5rem 0.9rem', borderRadius: 'var(--r-2)',
          fontSize: '0.8rem', backdropFilter: 'blur(20px) saturate(180%)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          maxWidth: '80vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{hover}</div>
      )}
      {count > 0 && (
        <div style={{ position: 'absolute', top: 16, right: 16, color: '#9ca3af', fontSize: '0.78rem', background: 'rgba(15,17,21,0.85)', padding: '4px 10px', borderRadius: 6, backdropFilter: 'blur(10px)' }}>
          {count} docs · click slice to zoom · click center to zoom out
        </div>
      )}
    </div>
  );
}
