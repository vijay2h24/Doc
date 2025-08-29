import React, { useEffect, useRef, useState } from 'react';

// All possible change indicator classes
const CHANGE_SELECTORS = [
  '.git-line-added',
  '.git-line-removed', 
  '.git-line-modified',
  '.git-inline-added',
  '.git-inline-removed',
  '.git-cell-added',
  '.git-cell-removed',
  '.git-cell-modified',
  '.structural-added',
  '.structural-removed',
  '.structural-modified'
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
  // For inline changes, use the parent block element
  if (el.classList.contains('git-inline-added') || el.classList.contains('git-inline-removed')) {
    const block = el.closest('p,h1,h2,h3,h4,h5,h6,li,div,td,th');
    return block || el;
  }
  return el;
};

const MiniMap = ({ leftContainerId, rightContainerId }) => {
  const containerRef = useRef(null);
  const [markers, setMarkers] = useState([]);
  const [viewport, setViewport] = useState({ topRatio: 0, heightRatio: 0 });

  const getContainers = () => ({
    left: document.getElementById(leftContainerId),
    right: document.getElementById(rightContainerId)
  });

  const collectMarkersFromPane = (pane, side) => {
    if (!pane) return [];
    
    const scrollableHeight = Math.max(1, pane.scrollHeight);
    const nodes = Array.from(pane.querySelectorAll(CHANGE_SELECTORS.join(',')));
    const markers = [];

    nodes.forEach((el) => {
      // Determine change type and color
      let color = '#6b7280'; // default gray
      let changeType = 'unknown';
      
      if (el.classList.contains('git-line-added') || 
          el.classList.contains('git-inline-added') || 
          el.classList.contains('git-cell-added') ||
          el.classList.contains('structural-added')) {
        color = '#22c55e'; // green
        changeType = 'added';
      } else if (el.classList.contains('git-line-removed') || 
                 el.classList.contains('git-inline-removed') || 
                 el.classList.contains('git-cell-removed') ||
                 el.classList.contains('structural-removed')) {
        color = '#ef4444'; // red
        changeType = 'removed';
      } else if (el.classList.contains('git-line-modified') || 
                 el.classList.contains('git-cell-modified') ||
                 el.classList.contains('structural-modified')) {
        color = '#f59e0b'; // yellow/orange
        changeType = 'modified';
      }

      const target = findMarkerTarget(el);
      const topWithinPane = getOffsetTopRelativeTo(target, pane);
      const ratio = Math.min(1, Math.max(0, topWithinPane / scrollableHeight));
      
      markers.push({ 
        ratio, 
        color, 
        changeType,
        side,
        element: el,
        target
      });
    });

    return markers;
  };

  const computeMarkers = () => {
    const { left, right } = getContainers();
    if (!left || !right) return [];

    const leftMarkers = collectMarkersFromPane(left, 'left');
    const rightMarkers = collectMarkersFromPane(right, 'right');
    const allMarkers = [...leftMarkers, ...rightMarkers];

    // Sort by position
    const sorted = allMarkers.sort((a, b) => a.ratio - b.ratio);
    
    // Deduplicate markers that are very close to each other
    const deduped = [];
    const threshold = 0.008; // Reduced threshold for better precision
    
    sorted.forEach((marker) => {
      const existing = deduped.find(m => Math.abs(m.ratio - marker.ratio) <= threshold);
      if (!existing) {
        deduped.push(marker);
      } else {
        // If we have overlapping markers, prefer the more specific one
        if (marker.changeType !== 'unknown' && existing.changeType === 'unknown') {
          const index = deduped.indexOf(existing);
          deduped[index] = marker;
        }
      }
    });

    return deduped;
  };

  const computeViewport = () => {
    const { left } = getContainers();
    if (!left || !containerRef.current) return { topRatio: 0, heightRatio: 0 };
    
    const scrollableHeight = Math.max(1, left.scrollHeight - left.clientHeight);
    const topRatio = scrollableHeight > 0 ? Math.min(1, Math.max(0, left.scrollTop / scrollableHeight)) : 0;
    const heightRatio = left.scrollHeight > 0 ? Math.min(1, left.clientHeight / left.scrollHeight) : 1;
    
    return { topRatio, heightRatio };
  };

  const refresh = () => {
    setMarkers(computeMarkers());
    setViewport(computeViewport());
  };

  useEffect(() => {
    // Initial refresh with delay to ensure content is rendered
    const initialTimer = setTimeout(refresh, 200);
    
    const { left, right } = getContainers();
    if (!(left && right)) return () => clearTimeout(initialTimer);

    const onScroll = () => {
      setViewport(computeViewport());
    };
    
    const onContentChange = () => {
      // Debounce content changes
      clearTimeout(window.minimapRefreshTimer);
      window.minimapRefreshTimer = setTimeout(refresh, 100);
    };

    // Listen for scroll events
    left.addEventListener('scroll', onScroll, { passive: true });
    right.addEventListener('scroll', onScroll, { passive: true });

    // Listen for content changes with more comprehensive observation
    const obsLeft = new MutationObserver(onContentChange);
    const obsRight = new MutationObserver(onContentChange);
    
    obsLeft.observe(left, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['class', 'style'],
      characterData: true 
    });
    obsRight.observe(right, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['class', 'style'],
      characterData: true 
    });

    // Listen for window resize
    const onResize = () => {
      clearTimeout(window.minimapResizeTimer);
      window.minimapResizeTimer = setTimeout(refresh, 150);
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(window.minimapRefreshTimer);
      clearTimeout(window.minimapResizeTimer);
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

    // Find the closest marker to the click position
    const sortedMarkers = (markers || []).slice().sort((a, b) => a.ratio - b.ratio);
    const target = sortedMarkers.reduce((best, marker) => {
      const dist = Math.abs(marker.ratio - clickRatio);
      if (!best || dist < best.dist) return { marker, dist };
      return best;
    }, null);

    if (!target) {
      // No markers, just scroll to the clicked position
      const scrollToRatio = (pane, ratio) => {
        const maxScroll = Math.max(0, pane.scrollHeight - pane.clientHeight);
        const y = Math.max(0, Math.min(maxScroll, Math.round(maxScroll * ratio)));
        pane.scrollTo({ top: y, behavior: 'smooth' });
      };
      
      scrollToRatio(left, clickRatio);
      scrollToRatio(right, clickRatio);
      return;
    }

    // Scroll to the target marker
    const scrollToRatio = (pane, ratio) => {
      const maxScroll = Math.max(0, pane.scrollHeight - pane.clientHeight);
      const y = Math.max(0, Math.min(maxScroll, Math.round(maxScroll * ratio)));
      pane.scrollTo({ top: y, behavior: 'smooth' });
    };

    scrollToRatio(left, target.marker.ratio);
    scrollToRatio(right, target.marker.ratio);

    // Highlight the target element briefly
    if (target.marker.element) {
      target.marker.element.style.transition = 'box-shadow 0.3s ease';
      target.marker.element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5)';
      setTimeout(() => {
        target.marker.element.style.boxShadow = '';
      }, 1000);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-48 p-3 select-none self-start">
      <div className="text-xs text-gray-500 mb-2 text-center font-medium">
        Changes Map
      </div>
      <div 
        ref={containerRef} 
        onClick={onClick} 
        className="relative w-full h-full cursor-pointer bg-gray-50 rounded border border-gray-200" 
        title="Click to jump to changes"
      >
        {/* Background grid for better visual reference */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(10)].map((_, i) => (
            <div 
              key={i}
              className="absolute left-0 right-0 border-t border-gray-300"
              style={{ top: `${(i + 1) * 10}%` }}
            />
          ))}
        </div>
        
        {/* Change markers */}
        {markers.map((marker, i) => (
          <div 
            key={i} 
            className="absolute left-0 right-0 rounded-sm transition-opacity hover:opacity-100" 
            style={{ 
              top: `${marker.ratio * 100}%`, 
              height: '4px', 
              background: marker.color,
              opacity: 0.85,
              zIndex: 10
            }}
            title={`${marker.changeType} change`}
          />
        ))}
        
        {/* Viewport indicator */}
        <div
          className="absolute left-0 right-0 border-2 border-blue-500 bg-blue-200/30 rounded transition-all duration-200"
          style={{ 
            top: `${viewport.topRatio * 100}%`, 
            height: `${Math.max(2, viewport.heightRatio * 100)}%`,
            zIndex: 20
          }}
          title="Current view"
        />
        
        {/* Markers count indicator */}
        {markers.length > 0 && (
          <div className="absolute bottom-1 right-1 bg-gray-700 text-white text-xs px-2 py-1 rounded">
            {markers.length} changes
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniMap;