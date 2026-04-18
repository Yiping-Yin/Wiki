'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';

const commitments = [
  {
    title: 'Source is sacred.',
    text: 'The document is the first foreground object.',
    img: '/design/about/6291371dac8875a06a4ca5384122b5a6.jpg',
  },
  {
    title: 'Panels are earned.',
    text: 'A panel is a settled judgment, not a decorative card.',
    img: '/design/about/44f56173d8d2e33be6ac509643792d66.jpg',
  },
  {
    title: 'Relations are earned.',
    text: 'A weave is a judged relation, not a loose backlink list.',
    img: '/design/about/bcba8c0bc2bfe19446653e850b0a9008.jpg',
  },
  {
    title: 'Work begins from change.',
    text: 'The scheduler should surface unresolved change, not generic activity.',
    img: '/design/about/f8e95e15e3d6e916d25adf4b97e65959.jpg',
  },
] as const;

const vocabulary = [
  ['Source', 'The original material. The source remains the first foreground object.'],
  ['Thought-anchor · ◆', 'A source-bound point of thought attached to a specific passage.'],
  ['Panel', 'A settled judgment.'],
  ['Weave', 'A judged relation between panels.'],
  ['Pattern', 'One crystallized thought map — a complete piece of understanding woven from a single source.'],
  ['Atlas', 'The structured collective of all your woven patterns.'],
  ['Comet', 'The flash of connection. Insight appears like a comet; Loom tries to keep the tail, not just the spark.'],
] as const;

const grammar = [
  ['Shuttle', '⌘K', 'Move anywhere quickly. The fast path, not the main navigation layer.'],
  ['Interlace', 'Click margin', 'Capture a source-bound thought.'],
  ['Review', '⌘/', 'Bring the Live Note to the center and review the woven understanding of the current document.'],
  ['Crystallize', 'Settle', 'Settle a thought container or a whole pattern.'],
  ['Resolve', 'Done', 'Finish the current change, not the object forever.'],
] as const;

export default function AboutClient() {
  return (
    <div className="min-h-screen bg-[#050505] text-[#E5E5E5] antialiased selection:bg-white/20 selection:text-white">
      <NavBar />
      <Hero />
      <BrandIdentity />
      <Philosophy />
      <Commitments />
      <WhyLoom />
      <Vocabulary />
      <Grammar />
      <Epilogue />
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function useReveal(options?: { threshold?: number; rootMargin?: string }) {
  const { threshold = 0.18, rootMargin = '-40px 0px' } = options ?? {};
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, rootMargin, threshold]);

  return { ref, visible, reduced };
}

function FadeIn({
  children,
  delay = 0,
  distance = 20,
  blur = 0,
  duration = 1000,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  blur?: number;
  duration?: number;
  className?: string;
}) {
  const { ref, visible, reduced } = useReveal();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible || reduced ? 'translateY(0)' : `translateY(${distance}px)`,
        filter: visible || reduced ? 'blur(0px)' : `blur(${blur}px)`,
        transition: reduced
          ? 'none'
          : `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, filter ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function ParallaxImage({
  src,
  alt,
  className = '',
  speed = 0.2,
}: {
  src: string;
  alt: string;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [translateY, setTranslateY] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const node = ref.current;
    if (!node) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = ((viewport - rect.top) / (viewport + rect.height)) * 2 - 1;
      setTranslateY(progress * speed * 100);
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced, speed]);

  return (
    <div ref={ref} className={`overflow-hidden relative ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="100vw"
        className="absolute inset-0 h-full w-full object-cover origin-center"
        style={{
          transform: reduced ? 'translate3d(0,0,0) scale(1.02)' : `translate3d(0, ${translateY}%, 0) scale(${1 + speed})`,
          transition: reduced ? 'none' : 'transform 120ms linear',
        }}
      />
    </div>
  );
}

function NavBar() {
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-8 py-8 mix-blend-difference text-white/90">
      <div className="font-serif text-lg italic tracking-wide">Loom</div>
      <div className="text-xs font-medium uppercase tracking-widest text-white/50">Human logic · AI reach</div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-6 py-20 md:py-24">
      <div className="absolute inset-0 opacity-40 mix-blend-luminosity">
        <ParallaxImage src="/design/about/IMG_3671.JPG" alt="Weaver" className="h-full w-full" speed={0.06} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/20 via-[#050505]/60 to-[#050505]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl space-y-8 text-center md:space-y-10">
        <FadeIn blur={5} distance={24} duration={1200}>
          <h1 className="font-serif text-3xl leading-[1.2] tracking-tight text-[#E5E5E5] md:text-5xl lg:text-6xl">
            Human logic. AI reach.
          </h1>
        </FadeIn>
        <FadeIn delay={260} distance={30} blur={4} duration={1320}>
          <p className="mx-auto max-w-2xl text-lg font-light leading-relaxed text-[#888888] md:text-xl">
            Loom is a thinking system where human logic leads and AI expands the field of view.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function BrandIdentity() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center border-t border-white/5 bg-[#050505] px-6 py-24 md:py-28">
      <div className="w-full max-w-[118rem]">
        <FadeIn className="mb-16 text-center" duration={920}>
          <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-[#666]">The Mark</h2>
          <p className="text-lg font-light text-[#A3A3A3]">The latest identity system keeps the wordmark calm, structural, and exact.</p>
          <p className="mx-auto mt-4 max-w-3xl text-sm font-light leading-relaxed text-[#6f6f73] md:text-[0.95rem]">
            This reference asset carries the full language of the name: the stable left axis, the continuous crossing center stroke, and the quieter return into order. It is the clearest full-scale expression of the current Loom mark.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 gap-8">
          <FadeIn duration={980} blur={3}>
            <div className="mx-auto w-full max-w-[48rem]">
              <div className="group relative aspect-[3312/1264] overflow-hidden rounded-xl border border-white/10 bg-[#050505] shadow-2xl">
                <Image
                  src="/brand/loom_wordmark_about_reference.png"
                  alt="Latest Loom wordmark"
                  fill
                  sizes="(max-width: 900px) 100vw, 768px"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </FadeIn>
        </div>

        <div className="mx-auto mt-24 grid max-w-[70rem] grid-cols-1 gap-14 px-4 md:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)]">
          <FadeIn delay={340} distance={12} blur={2}>
            <ConceptBlock
              title="LO — Human Logic"
              text="The human side keeps judgment: framing the question, choosing the standard, deciding what matters, and knowing when something is worth keeping."
            />
          </FadeIn>
          <FadeIn delay={420} distance={12} blur={2}>
            <ConceptBlock
              title="OM — AI Reach"
              text="The AI side widens the field: recall, adjacency, synthesis, and pattern visibility at a scale a person cannot manually hold alone."
            />
          </FadeIn>
          <FadeIn delay={500} distance={12} blur={2}>
            <ConceptBlock
              title="LOOM — One structural word"
              text="At full scale the mark should stay extended, architectural, and quiet. The point is not ornament, but a stable structure that lets the name carry its own intelligence."
            />
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function Philosophy() {
  return (
    <section className="flex min-h-screen items-center border-t border-white/5 bg-[#050505] px-8 py-24 md:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-24 md:grid-cols-2">
        <div className="space-y-16">
          <FadeIn blur={3}>
            <h2 className="mb-6 font-serif text-3xl text-[#E5E5E5]">织者即智者。</h2>
            <p className="text-lg font-light leading-relaxed text-[#A3A3A3]">
              Humans are better at judgment. We decide what matters, what to ignore, what a question really means, and when something is good enough to keep. Loom may organize, suggest, and reflect, but the judgment remains with the person doing the work.
            </p>
          </FadeIn>

          <FadeIn delay={100} blur={3}>
            <h2 className="mb-6 font-serif text-3xl text-[#E5E5E5]">润物无声。</h2>
            <p className="text-lg font-light leading-relaxed text-[#A3A3A3]">
              AI is better at scale, but it should still be felt in the result, not in self-display. Loom should widen the field without performing intelligence. The user should feel understanding becoming clearer, not machinery stepping into the foreground.
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={200}>
          <ParallaxImage
            src="/design/about/54d758192e794f31b3f11ce0e0df64ac.jpg"
            alt="Loom Architecture"
            className="aspect-[4/5] w-full overflow-hidden rounded-[2px] opacity-90 sepia-[0.2]"
            speed={0.12}
          />
        </FadeIn>
      </div>
    </section>
  );
}

function Commitments() {
  return (
    <section className="flex min-h-screen items-center bg-[#0A0A0A] px-8 py-24 md:py-28">
      <div className="mx-auto max-w-7xl">
          <FadeIn duration={1100}>
            <h2 className="mb-16 border-b border-white/10 pb-4 font-mono text-sm uppercase tracking-widest text-[#666]">Four Commitments</h2>
          </FadeIn>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {commitments.map((item, i) => (
            <FadeIn key={item.title} delay={i * 120} distance={18} blur={2} duration={920} className="group">
              <div className="relative mb-6 aspect-[3/4] overflow-hidden bg-[#111]">
                <Image
                  src={item.img}
                  alt={item.title}
                  fill
                  sizes="(max-width: 900px) 100vw, 560px"
                  className="h-full w-full object-cover opacity-60 grayscale-[0.4] transition-all duration-700 ease-out group-hover:scale-[1.02] group-hover:grayscale-[0.12] group-hover:opacity-88"
                />
                <div className="absolute inset-0 border border-white/5" />
              </div>
              <h3 className="mb-2 text-lg font-medium tracking-tight text-white">{item.title}</h3>
              <p className="text-sm font-light leading-relaxed text-[#888]">{item.text}</p>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyLoom() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-[#050505] px-8 py-24 md:py-28">
      <div className="relative z-10 mx-auto max-w-4xl space-y-16 text-center">
        <FadeIn blur={3} duration={1120}>
          <div className="mx-auto mb-16 h-px w-16 bg-[#333]" />
          <h2 className="mb-8 font-serif text-3xl leading-snug text-[#E5E5E5] md:text-4xl">
            Better judgment needs both structure and range.
          </h2>
          <p className="text-xl font-light leading-relaxed text-[#A3A3A3]">
            Human reasoning can hold standards, sequence, and responsibility. AI can search wider, connect more, and surface patterns across a field that would be too large to hold manually.{' '}
            <span className="font-medium text-white">Loom exists to keep those roles aligned.</span>
          </p>
        </FadeIn>

        <FadeIn delay={280} distance={18} blur={2} duration={1040}>
          <p className="text-lg font-light leading-relaxed text-[#888]">
            The product is not trying to sound all-knowing. It is trying to give a person more reach without taking away authorship. AI extends perception. The person still decides what the pattern means.
          </p>
        </FadeIn>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-full w-[120%] -translate-x-1/2 -translate-y-1/2 opacity-10">
        <ParallaxImage
          src="/design/about/435ccc5c1eeb26ff91fc906ffe2a10f3.jpg"
          alt="Loom mechanism mechanics"
          className="h-full w-full mix-blend-screen"
          speed={0.1}
        />
      </div>
    </section>
  );
}

function Vocabulary() {
  return (
    <section className="flex min-h-screen items-center border-t border-white/5 bg-[#0A0A0A] px-8 py-24 md:py-28">
      <div className="mx-auto flex max-w-7xl flex-col gap-24 lg:flex-row">
        <div className="w-full lg:w-1/2">
          <FadeIn duration={1150}>
            <ParallaxImage src="/design/about/2c0d12091dec257ddd9f63dd8d9af323.jpg" alt="Threads" className="aspect-square w-full rounded-[2px] opacity-80" speed={0.1} />
          </FadeIn>
        </div>

        <div className="flex w-full flex-col justify-center lg:w-1/2">
          <FadeIn duration={1080}>
            <h2 className="mb-12 font-mono text-sm uppercase tracking-widest text-[#666]">The Vocabulary of the Weaver</h2>
          </FadeIn>

          <div className="space-y-8">
            {vocabulary.map(([term, def], i) => (
              <FadeIn key={term} delay={i * 70} distance={14} blur={1} duration={860}>
                <div className="flex flex-col gap-2 border-b border-white/5 pb-6 md:flex-row md:items-baseline md:gap-6">
                  <span className="min-w-[180px] text-lg font-medium tracking-tight text-[#E5E5E5]">{term}</span>
                  <span className="font-light leading-relaxed text-[#888]">{def}</span>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Grammar() {
  return (
    <section className="flex min-h-screen items-center bg-[#050505] px-8 py-24 md:py-28">
      <div className="mx-auto max-w-4xl">
        <FadeIn duration={1040}>
          <h2 className="mb-16 text-center font-serif text-3xl text-white">Interaction Grammar</h2>
        </FadeIn>

        <div className="space-y-4">
          {grammar.map(([verb, key, desc], i) => (
            <FadeIn key={verb} delay={i * 110} distance={14} blur={1} duration={860}>
              <div className="flex flex-col gap-4 border border-white/5 bg-[#0D0D0D] p-6 transition-colors hover:bg-[#111] md:flex-row md:items-center md:gap-8 md:p-8">
                <div className="flex min-w-[200px] items-center gap-4">
                  <span className="text-xl font-medium text-white">{verb}</span>
                  <kbd className="rounded border border-[#333] bg-[#1A1A1A] px-2 py-1 font-mono text-xs text-[#A3A3A3]">{key}</kbd>
                </div>
                <p className="m-0 font-light leading-relaxed text-[#888]">{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function Epilogue() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-6 py-24 md:py-28">
      <div className="absolute inset-0 z-0">
        <ParallaxImage src="/design/about/6569dee913e2c11f1388a561e75f2f0b.jpg" alt="Final Pattern" className="h-full w-full opacity-30" speed={0.08} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <FadeIn blur={5} duration={1200}>
          <p className="mb-12 font-serif text-2xl leading-snug tracking-tight text-white md:text-4xl">
            Knowledge may be vast. <br />
            Judgment stays human. <br />
            AI widens the field.
          </p>
        </FadeIn>
        <FadeIn delay={320} distance={18} blur={2} duration={1180}>
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-[#888]">
            Loom gives human reasoning a wider field <br className="md:hidden" /> without surrendering judgment.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function StatementBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="mb-6 font-serif text-3xl text-[#E5E5E5]">{title}</h2>
      <p className="text-lg font-light leading-relaxed text-[#A3A3A3]">{text}</p>
    </div>
  );
}

function ConceptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-4">
      <div
        className="border-b border-white/10 pb-4 font-serif text-[1.15rem] leading-[1.18] text-white md:text-[1.2rem]"
        style={{ textWrap: 'balance' }}
      >
        {title}
      </div>
      <p className="text-sm font-light leading-relaxed text-[#888]">{text}</p>
    </div>
  );
}
