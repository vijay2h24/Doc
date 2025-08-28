import React, { useEffect, useRef, useState } from 'react';

const LINE_CLASSES = {
  added: 'git-line-added',
  removed: 'git-line-removed',
  modified: 'git-line-modified'
};
const INLINE_CLASSES = {
  added: 'git-inline-added',
  removed: 'git-inline-removed'
};
const CELL_CLASSES = {
  added: 'git-cell-added',
  removed: 'git-cell-removed',
  modified: 'git-cell-modified'
};
const STRUCT_CLASSES = {
  added: 'structural-added',
  removed: 'structural-removed',
  modified: 'structural-modified'
};
const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,pre,div';
const CHANGE_SELECTORS = [
  '.git-line-added',
  '.git-line-removed',
  '.git-line-modified',
  '.git-inline-added',
  '.git-inline-removed',
  '.git-cell-added',
  '.git-cell-removed',
  '.git-cell-modified',
  'img.structural-added',
  'img.structural-removed',
  'img.structural-modified',
  'table.structural-added',
  'table.structural-removed',
  'table.structural-modified'
];

const getOffsetTopRelativeTo = (node, ancestor) => {
  let top = 0;
  let el = node;
  while (el && el !== ancestor) {
    top += el.offsetTop || 0;
    el = el.offsetParent;
  }
  return top;
};

const findMarkerTarget = (el) => {
  if (!el) return el;
  // Prefer block-level ancestor for stable positioning
  const block = el.closest(BLOCK_SELECTOR);
  return block || el;
};

const MiniMap = ({ leftContainerId, rightContainerId }) => {
  const containerRef = useRef(null);
  const [markers, setMarkers] = useState([]);
  const [viewport, setViewport] = useState({ topRatio: 0, heightRatio: 0 });

  const getContainers = () => ({
    left: document.getElementById(leftContainerId),
    right: document.getElementById(rightContainerId)
  });

  const collectMarkersFromPane = (pane) => {
    if (!pane) return [];
    const maxScroll = Math.max(1, pane.scrollHeight - pane.clientHeight);
    const nodes = Array.from(pane.querySelectorAll(CHANGE_SELECTORS.join(',')));
    const list = [];

    nodes.forEach((el) => {
      const isAdded = el.classList.contains(LINE_CLASSES.added) || el.classList.contains(INLINE_CLASSES.added) || el.classList.contains(CELL_CLASSES.added) || el.classList.contains(STRUCT_CLASSES.added);
      const isRemoved = el.classList.contains(LINE_CLASSES.removed) || el.classList.contains(INLINE_CLASSES.removed) || el.classList.contains(CELL_CLASSES.removed) || el.classList.contains(STRUCT_CLASSES.removed);
      const isModified = el.classList.contains(LINE_CLASSES.modified) || el.classList.contains(CELL_CLASSES.modified) || el.classList.contains(STRUCT_CLASSES.modified);
      const target = findMarkerTarget(el);
      const topWithinPane = getOffsetTopRelativeTo(target, pane);
      const ratio = Math.min(1, Math.max(0, topWithinPane / (maxScroll || 1)));
      const color = isAdded ? '#28a745' : isRemoved ? '#dc3545' : '#ffc107';
      list.push({ ratio, color });
    });

    return list;
  };

  const computeMarkers = () => {
    const { left, right } = getContainers();
    if (!left || !right) return [];

    const all = [...collectMarkersFromPane(left), ...collectMarkersFromPane(right)];

    // Deduplicate nearby markers to avoid dense stacking
    const sorted = all.sort((a, b) => a.ratio - b.ratio);
    const deduped = [];
    const threshold = 0.01; // 1% of scroll height to reduce clutter
    sorted.forEach((m) => {
      const last = deduped[deduped.length - 1];
      if (!last || Math.abs(last.ratio - m.ratio) > threshold) deduped.push(m);
    });

    return deduped;
  };

  const computeViewport = () => {
    const { left } = getContainers();
    if (!left || !containerRef.current) return { topRatio: 0, heightRatio: 0 };
    const maxScroll = Math.max(1, left.scrollHeight - left.clientHeight);
    const topRatio = Math.min(1, Math.max(0, left.scrollTop / maxScroll));
    const heightRatio = Math.min(1, left.clientHeight / (left.scrollHeight || 1));
    return { topRatio, heightRatio };
  };

  const refresh = () => {
    setMarkers(computeMarkers());
    setViewport(computeViewport());
  };

  useEffect(() => {
    refresh();
    const { left, right } = getContainers();
    if (!(left && right)) return;

    const onScroll = () => refresh();
    left.addEventListener('scroll', onScroll);
    right.addEventListener('scroll', onScroll);

    const obsLeft = new MutationObserver(refresh);
    const obsRight = new MutationObserver(refresh);
    obsLeft.observe(left, { childList: true, subtree: true, attributes: true });
    obsRight.observe(right, { childList: true, subtree: true, attributes: true });

    const onResize = () => refresh();
    window.addEventListener('resize', onResize);

    return () => {
      left.removeEventListener('scroll', onScroll);
      right.removeEventListener('scroll', onScroll);
      obsLeft.disconnect();
      obsRight.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [leftContainerId, rightContainerId]);

  const onClick = (e) => {
    const { left, right } = getContainers();
    if (!left || !right || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickRatio = (e.clientY - rect.top) / rect.height;

    const sorted = (markers || []).slice().sort((a, b) => a.ratio - b.ratio);
    const target = sorted.reduce((best, m) => {
      const dist = Math.abs(m.ratio - clickRatio);
      if (!best || dist < best.dist) return { m, dist };
      return best;
    }, null);
    if (!target) return;

    const scrollToRatio = (pane, ratio) => {
      const maxScroll = Math.max(0, pane.scrollHeight - pane.clientHeight);
      const y = Math.max(0, Math.min(maxScroll, Math.round(maxScroll * ratio)));
      pane.scrollTo({ top: y, behavior: 'smooth' });
    };

    scrollToRatio(left, target.m.ratio);
    scrollToRatio(right, target.m.ratio);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-48 p-3 select-none self-start">
      <div ref={containerRef} onClick={onClick} className="relative w-full h-full cursor-pointer" title="Click to jump to nearest change">
        <div className="absolute inset-0 bg-gray-50 rounded" />
        {markers.map((m, i) => (
          <div key={i} className="absolute left-0 right-0" style={{ top: `${m.ratio * 100}%`, height: 3, background: m.color, opacity: 0.95 }} />
        ))}
        <div
          className="absolute left-0 right-0 border border-blue-400/70 bg-blue-200/20 rounded"
          style={{ top: `${viewport.topRatio * 100}%`, height: `${viewport.heightRatio * 100}%` }}
        />
      </div>
    </div>
  );
};

export default MiniMap;



