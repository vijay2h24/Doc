import React, { useEffect, useMemo, useRef, useState } from 'react';

const markerFor = (cls) => ({ selector: `.${cls}`, color: cls === 'git-line-added' ? '#28a745' : cls === 'git-line-removed' ? '#dc3545' : '#ffc107' });
const MARKERS = [markerFor('git-line-added'), markerFor('git-line-removed'), markerFor('git-line-modified')];

const MiniMap = ({ leftContainerId, rightContainerId }) => {
  const containerRef = useRef(null);
  const [height, setHeight] = useState(0);

  const getContainers = () => {
    return {
      left: document.getElementById(leftContainerId),
      right: document.getElementById(rightContainerId)
    };
  };

  const computeMarkers = () => {
    const { left, right } = getContainers();
    if (!left || !right) return [];

    const totalScroll = Math.max(left.scrollHeight, right.scrollHeight) || 1;
    const result = [];

    [left, right].forEach((pane, idx) => {
      MARKERS.forEach(({ selector, color }) => {
        const nodes = Array.from(pane.querySelectorAll(selector));
        nodes.forEach((node) => {
          const top = node.offsetTop;
          const ratio = top / totalScroll;
          result.push({ ratio, color, y: top });
        });
      });
    });

    return result.sort((a, b) => a.ratio - b.ratio);
  };

  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    setHeight(containerRef.current?.clientHeight || 0);
    const update = () => setMarkers(computeMarkers());
    update();
    const int = setInterval(update, 500);
    return () => clearInterval(int);
  }, []);

  const onClick = (e) => {
    const { left, right } = getContainers();
    if (!left || !right || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickRatio = (e.clientY - rect.top) / rect.height;

    // Find the nearest change marker at or below click; wrap to first if none
    const sorted = (markers || []).slice().sort((a, b) => a.ratio - b.ratio);
    const target = sorted.find(m => m.ratio >= clickRatio) || sorted[0];
    if (!target) return;

    const y = Math.max(target.y - 12, 0);
    left.scrollTo({ top: y, behavior: 'smooth' });
    right.scrollTo({ top: y, behavior: 'smooth' });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-48 p-3 select-none self-start">
      <div ref={containerRef} onClick={onClick} className="relative w-full h-full cursor-pointer" title="Click to scroll both panes">
        <div className="absolute inset-0 bg-gray-50 rounded" />
        {markers.map((m, i) => (
          <div key={i} className="absolute left-1 right-1" style={{ top: `${m.ratio * 100}%`, height: 2, background: m.color, opacity: 0.9 }} />
        ))}
      </div>
    </div>
  );
};

export default MiniMap;


