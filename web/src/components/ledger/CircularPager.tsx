import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isHorizontalGesture, swipeDecision, wrapIndex } from '@yorbalance/shared';

interface View { id: string; label: string; icon?: React.ReactNode; render: () => React.ReactNode }

const NO_SWIPE = 'input, textarea, select, [contenteditable], [data-no-swipe], object, iframe';

/** Is `el` (or an ancestor up to the pager) a sideways-scrollable region? Then swipes belong to it. */
function insideHorizontalScroller(el: Element | null, stop: Element | null): boolean {
  for (let n = el; n && n !== stop; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
  }
  return false;
}

/**
 * §8.1 / §8.8 circular three-view pager. A virtual index moves ±1 per swipe; the visible view
 * wraps (Party → Sales → Purchases → Party). Commits past 25 % width or on a fast fling, else
 * springs back. Swipes are ignored in form controls and scrollable regions; vertical page
 * scrolling is untouched (touch-action: pan-y). Tabs always work; ←/→ keys on desktop.
 * All views stay mounted (keyed), so half-typed forms survive switching.
 */
export const CircularPager: React.FC<{ views: View[]; index: number; onIndexChange: (i: number) => void; hint?: string }> = ({ views, index, onIndexChange, hint }) => {
  const n = views.length;
  const cur = wrapIndex(index, n);
  const viewport = useRef<HTMLDivElement>(null);
  const curPane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; horizontal: boolean | null; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState<null | -1 | 0 | 1>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // Viewport height follows the visible pane so neighbours never add empty space.
  useLayoutEffect(() => {
    const el = curPane.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [cur]);

  // Desktop: arrow keys switch views when the user is not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement)?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowRight') onIndexChange(index + 1);
      if (e.key === 'ArrowLeft') onIndexChange(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onIndexChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (animating !== null || e.pointerType === 'mouse') return; // mouse users have tabs / arrow keys
    const target = e.target as Element;
    if (target.closest(NO_SWIPE) || insideHorizontalScroller(target, viewport.current)) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), horizontal: null, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x, my = e.clientY - d.y;
    if (d.horizontal === null) {
      d.horizontal = isHorizontalGesture(mx, my);
      if (d.horizontal) viewport.current?.setPointerCapture(e.pointerId);
      if (d.horizontal === false) { drag.current = null; return; }
    }
    if (d.horizontal) setDx(mx);
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.horizontal) { setDx(0); return; }
    const mx = e.clientX - d.x;
    const v = mx / Math.max(1, performance.now() - d.t);
    const decision = swipeDecision(mx, viewport.current?.offsetWidth ?? 0, v);
    setAnimating(decision);
  };
  const onTransitionEnd = () => {
    if (animating === null) return;
    const step = animating;
    setAnimating(null);
    setDx(0);
    if (step) onIndexChange(index + step);
  };

  const order = [wrapIndex(cur - 1, n), cur, wrapIndex(cur + 1, n)];
  const offset = animating === 1 ? '-200%' : animating === -1 ? '0%' : `calc(-100% + ${dx}px)`;

  return (
    <div>
      <div role="tablist" className="grid gap-2 mb-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {views.map((v, i) => (
          <button key={v.id} role="tab" aria-selected={i === cur} aria-controls={`pane-${v.id}`} onClick={() => onIndexChange(index + (i - cur))}
            className={`h-12 rounded-xl text-base font-bold flex items-center justify-center gap-2 ${i === cur ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {v.icon}{v.label}
          </button>
        ))}
      </div>
      {hint && <p className="md:hidden text-sm text-slate-500 text-center mb-2">{hint}</p>}
      <div ref={viewport} className="overflow-hidden" style={{ touchAction: 'pan-y', height }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}>
        <div className="flex items-start" onTransitionEnd={onTransitionEnd}
          style={{ transform: `translateX(${offset})`, transition: animating !== null ? 'transform 220ms ease-out' : 'none' }}>
          {order.map((vi, slot) => {
            const v = views[vi];
            return (
              <div key={v.id} id={`pane-${v.id}`} role="tabpanel" aria-hidden={slot !== 1}
                ref={slot === 1 ? curPane : undefined} className="w-full shrink-0"
                {...(slot !== 1 ? { inert: '' as any } : {})}>
                {v.render()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
