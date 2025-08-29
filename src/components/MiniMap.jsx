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

      // Get element position relative to the scrollable container
      const elementTop = el.offsetTop;
      const ratio = Math.min(1, Math.max(0, elementTop / scrollableHeight));
      
      markers.push({ 
        ratio, 
        color, 
        changeType,
        side,
        element: el,
        elementTop
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
    const threshold = 0.01; // 1% threshold for deduplication
    
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
    
    const scrollTop = left.scrollTop;
    const clientHeight = left.clientHeight;
    const scrollHeight = left.scrollHeight;
    
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const topRatio = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
    const heightRatio = scrollHeight > 0 ? Math.min(1, clientHeight / scrollHeight) : 1;
    
    return { topRatio, heightRatio };
  };

  const refresh = () => {
    setMarkers(computeMarkers());
    setViewport(computeViewport());
  };

  useEffect(() => {
    // Initial refresh with delay to ensure content is rendered
    const initialTimer = setTimeout(refresh, 300);
    
    const { left, right } = getContainers();
    if (!(left && right)) return () => clearTimeout(initialTimer);

    const onScroll = () => {
      setViewport(computeViewport());
    };
    
    const onContentChange = () => {
      // Debounce content changes
      clearTimeout(window.minimapRefreshTimer);
      window.minimapRefreshTimer = setTimeout(refresh, 150);
    };

    // Listen for scroll events
    left.addEventListener('scroll', onScroll, { passive: true });
    right.addEventListener('scroll', onScroll, { passive: true });

    // Listen for content changes
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
      window.minimapResizeTimer = setTimeout(refresh, 200);
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

  const scrollToPosition = (targetRatio) => {
    const { left, right } = getContainers();
    if (!left || !right) return;

    // Calculate scroll position based on ratio
    const leftMaxScroll = Math.max(0, left.scrollHeight - left.clientHeight);
    const rightMaxScroll = Math.max(0, right.scrollHeight - right.clientHeight);
    
    const leftScrollTop = Math.round(leftMaxScroll * targetRatio);
    const rightScrollTop = Math.round(rightMaxScroll * targetRatio);

    // Scroll both containers simultaneously
    left.scrollTo({ top: leftScrollTop, behavior: 'smooth' });
    right.scrollTo({ top: rightScrollTop, behavior: 'smooth' });
  };

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const { left, right } = getContainers();
    if (!left || !right || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickRatio = Math.min(1, Math.max(0, clickY / rect.height));

    // Find the closest marker to the click position
    if (markers.length > 0) {
      const closestMarker = markers.reduce((closest, marker) => {
        const distance = Math.abs(marker.ratio - clickRatio);
        if (!closest || distance < closest.distance) {
          return { marker, distance };
        }
        return closest;
      }, null);

      // If click is close to a marker (within 5% of minimap height), jump to that marker
      if (closestMarker && closestMarker.distance < 0.05) {
        scrollToPosition(closestMarker.marker.ratio);
        
        // Highlight the target element briefly
        if (closestMarker.marker.element) {
          const element = closestMarker.marker.element;
          const originalBoxShadow = element.style.boxShadow;
          element.style.transition = 'box-shadow 0.3s ease';
          element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.6)';
          
          setTimeout(() => {
            element.style.boxShadow = originalBoxShadow;
            setTimeout(() => {
              element.style.transition = '';
            }, 300);
          }, 1200);
        }
        return;
      }
    }

    // No close marker found, scroll to the clicked position
    scrollToPosition(clickRatio);
  };

  const onMarkerClick = (e, marker) => {
    e.preventDefault();
    e.stopPropagation();
    
    scrollToPosition(marker.ratio);
    
    // Highlight the target element
    if (marker.element) {
      const element = marker.element;
      const originalBoxShadow = element.style.boxShadow;
      element.style.transition = 'box-shadow 0.3s ease';
      element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.6)';
      
      setTimeout(() => {
        element.style.boxShadow = originalBoxShadow;
        setTimeout(() => {
          element.style.transition = '';
        }, 300);
      }, 1200);
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
        className="relative w-full h-full cursor-pointer bg-gray-50 rounded border border-gray-200 overflow-hidden" 
        title="Click to navigate to changes"
      >
        {/* Background grid for better visual reference */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
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
            className="absolute left-0 right-0 rounded-sm transition-all duration-200 hover:opacity-100 hover:scale-y-150 cursor-pointer z-10" 
            style={{ 
              top: `${marker.ratio * 100}%`, 
              height: '3px', 
              background: marker.color,
              opacity: 0.8,
              transformOrigin: 'center'
            }}
            title={`${marker.changeType} change - click to navigate`}
            onClick={(e) => onMarkerClick(e, marker)}
          />
        ))}
        
        {/* Viewport indicator */}
        <div
          className="absolute left-0 right-0 border-2 border-blue-500 bg-blue-200/20 rounded transition-all duration-200 pointer-events-none z-20"
          style={{ 
            top: `${viewport.topRatio * 100}%`, 
            height: `${Math.max(2, viewport.heightRatio * 100)}%`
          }}
          title="Current view"
        />
        
        {/* Markers count indicator */}
        {markers.length > 0 && (
          <div className="absolute bottom-1 right-1 bg-gray-700 text-white text-xs px-2 py-1 rounded pointer-events-none z-30">
            {markers.length} changes
          </div>
        )}
        
        {/* Click instruction */}
        {markers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-xs text-gray-400 text-center">
              No changes detected
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniMap;