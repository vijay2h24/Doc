import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

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
  const minimapRef = useRef(null);
  const [markers, setMarkers] = useState([]);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);

  const getContainers = useCallback(() => ({
    left: document.getElementById(leftContainerId),
    right: document.getElementById(rightContainerId)
  }), [leftContainerId, rightContainerId]);

  const collectMarkers = useCallback(() => {
    const { left, right } = getContainers();
    if (!left || !right) return [];

    const allMarkers = [];
    
    // Collect markers from both containers
    [left, right].forEach((container, containerIndex) => {
      const side = containerIndex === 0 ? 'left' : 'right';
      const elements = container.querySelectorAll(CHANGE_SELECTORS.join(','));
      
      elements.forEach((element) => {
        // Get element position relative to container
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top + container.scrollTop;
        
        // Calculate position ratio
        const scrollHeight = Math.max(container.scrollHeight, container.clientHeight);
        const ratio = Math.min(1, Math.max(0, relativeTop / scrollHeight));
        
        // Determine change type and color
        let color = '#6b7280';
        let changeType = 'unknown';
        
        if (element.classList.contains('git-line-added') || 
            element.classList.contains('git-inline-added') || 
            element.classList.contains('git-cell-added') ||
            element.classList.contains('structural-added')) {
          color = '#10b981';
          changeType = 'added';
        } else if (element.classList.contains('git-line-removed') || 
                   element.classList.contains('git-inline-removed') || 
                   element.classList.contains('git-cell-removed') ||
                   element.classList.contains('structural-removed')) {
          color = '#ef4444';
          changeType = 'removed';
        } else if (element.classList.contains('git-line-modified') || 
                   element.classList.contains('git-cell-modified') ||
                   element.classList.contains('structural-modified')) {
          color = '#f59e0b';
          changeType = 'modified';
        }

        allMarkers.push({
          ratio,
          color,
          changeType,
          side,
          element,
          elementTop: relativeTop
        });
      });
    });

    // Sort by position and deduplicate nearby markers
    const sorted = allMarkers.sort((a, b) => a.ratio - b.ratio);
    const deduped = [];
    const threshold = 0.008; // Smaller threshold for better precision
    
    sorted.forEach((marker) => {
      const existing = deduped.find(m => Math.abs(m.ratio - marker.ratio) <= threshold);
      if (!existing) {
        deduped.push(marker);
      } else if (marker.changeType !== 'unknown' && existing.changeType === 'unknown') {
        const index = deduped.indexOf(existing);
        deduped[index] = marker;
      }
    });

    return deduped;
  }, [getContainers]);

  const updateViewport = useCallback(() => {
    const { left } = getContainers();
    if (!left) return;
    
    const scrollTop = left.scrollTop;
    const clientHeight = left.clientHeight;
    const scrollHeight = left.scrollHeight;
    
    if (scrollHeight <= clientHeight) {
      setViewport({ top: 0, height: 100 });
      return;
    }
    
    const topPercentage = (scrollTop / scrollHeight) * 100;
    const heightPercentage = (clientHeight / scrollHeight) * 100;
    
    setViewport({ 
      top: Math.min(100 - heightPercentage, topPercentage), 
      height: heightPercentage 
    });
  }, [getContainers]);

  const scrollToRatio = useCallback((targetRatio) => {
    const { left, right } = getContainers();
    if (!left || !right) return;

    // Calculate target scroll positions
    const leftMaxScroll = Math.max(0, left.scrollHeight - left.clientHeight);
    const rightMaxScroll = Math.max(0, right.scrollHeight - right.clientHeight);
    
    const leftScrollTop = Math.round(leftMaxScroll * targetRatio);
    const rightScrollTop = Math.round(rightMaxScroll * targetRatio);

    // Scroll both containers
    left.scrollTo({ top: leftScrollTop, behavior: 'smooth' });
    right.scrollTo({ top: rightScrollTop, behavior: 'smooth' });
  }, [getContainers]);

  const scrollToElement = useCallback((element) => {
    if (!element) return;
    
    element.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center',
      inline: 'nearest'
    });
    
    // Add temporary highlight
    const originalBoxShadow = element.style.boxShadow;
    const originalTransition = element.style.transition;
    
    element.style.transition = 'box-shadow 0.3s ease';
    element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.8), 0 0 20px rgba(59, 130, 246, 0.3)';
    
    setTimeout(() => {
      element.style.boxShadow = originalBoxShadow;
      setTimeout(() => {
        element.style.transition = originalTransition;
      }, 300);
    }, 1500);
  }, []);

  const handleMinimapClick = useCallback((e) => {
    if (!minimapRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = minimapRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickRatio = Math.min(1, Math.max(0, clickY / rect.height));
    
    // Find closest marker within reasonable distance
    const closestMarker = markers.reduce((closest, marker) => {
      const distance = Math.abs(marker.ratio - clickRatio);
      if (!closest || distance < closest.distance) {
        return { marker, distance };
      }
      return closest;
    }, null);
    
    // If click is close to a marker (within 3% of minimap height), jump to that marker
    if (closestMarker && closestMarker.distance < 0.03) {
      scrollToElement(closestMarker.marker.element);
    } else {
      // Otherwise scroll to the clicked position
      scrollToRatio(clickRatio);
    }
  }, [markers, scrollToRatio, scrollToElement]);

  const handleMarkerClick = useCallback((e, marker) => {
    e.preventDefault();
    e.stopPropagation();
    scrollToElement(marker.element);
  }, [scrollToElement]);

  const navigateToNext = useCallback(() => {
    const { left } = getContainers();
    if (!left || markers.length === 0) return;
    
    const currentScrollRatio = left.scrollTop / Math.max(1, left.scrollHeight - left.clientHeight);
    const nextMarker = markers.find(m => m.ratio > currentScrollRatio + 0.01);
    
    if (nextMarker) {
      scrollToElement(nextMarker.element);
    } else if (markers.length > 0) {
      // Go to first marker if at the end
      scrollToElement(markers[0].element);
    }
  }, [getContainers, markers, scrollToElement]);

  const navigateToPrevious = useCallback(() => {
    const { left } = getContainers();
    if (!left || markers.length === 0) return;
    
    const currentScrollRatio = left.scrollTop / Math.max(1, left.scrollHeight - left.clientHeight);
    const previousMarker = [...markers].reverse().find(m => m.ratio < currentScrollRatio - 0.01);
    
    if (previousMarker) {
      scrollToElement(previousMarker.element);
    } else if (markers.length > 0) {
      // Go to last marker if at the beginning
      scrollToElement(markers[markers.length - 1].element);
    }
  }, [getContainers, markers, scrollToElement]);

  const resetView = useCallback(() => {
    const { left, right } = getContainers();
    if (!left || !right) return;
    
    left.scrollTo({ top: 0, behavior: 'smooth' });
    right.scrollTo({ top: 0, behavior: 'smooth' });
  }, [getContainers]);

  // Initialize and refresh markers
  useEffect(() => {
    const refreshAll = () => {
      setMarkers(collectMarkers());
      updateViewport();
    };

    // Initial refresh with delay
    const initialTimer = setTimeout(refreshAll, 500);
    
    const { left, right } = getContainers();
    if (!left || !right) return () => clearTimeout(initialTimer);

    // Handle scroll events
    const handleScroll = () => {
      setIsScrolling(true);
      updateViewport();
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Set scrolling to false after scroll ends
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    // Handle content changes
    const handleContentChange = () => {
      // Debounce content changes
      clearTimeout(window.minimapContentTimer);
      window.minimapContentTimer = setTimeout(refreshAll, 200);
    };

    // Add event listeners
    left.addEventListener('scroll', handleScroll, { passive: true });
    right.addEventListener('scroll', handleScroll, { passive: true });

    // Observe DOM changes
    const observer = new MutationObserver(handleContentChange);
    observer.observe(left, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['class', 'style'],
      characterData: true 
    });
    observer.observe(right, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['class', 'style'],
      characterData: true 
    });

    // Handle window resize
    const handleResize = () => {
      clearTimeout(window.minimapResizeTimer);
      window.minimapResizeTimer = setTimeout(refreshAll, 300);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(window.minimapContentTimer);
      clearTimeout(window.minimapResizeTimer);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      left.removeEventListener('scroll', handleScroll);
      right.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [collectMarkers, updateViewport, getContainers]);

  // Group markers by type for legend
  const markersByType = markers.reduce((acc, marker) => {
    acc[marker.changeType] = (acc[marker.changeType] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-50 to-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-800">Navigation</h4>
          <div className="flex items-center gap-1">
            <button
              onClick={navigateToPrevious}
              disabled={markers.length === 0}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Previous change"
            >
              <ChevronUp className="h-3 w-3 text-gray-600" />
            </button>
            <button
              onClick={navigateToNext}
              disabled={markers.length === 0}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Next change"
            >
              <ChevronDown className="h-3 w-3 text-gray-600" />
            </button>
            <button
              onClick={resetView}
              className="p-1 rounded hover:bg-gray-200 transition-colors ml-1"
              title="Reset to top"
            >
              <RotateCcw className="h-3 w-3 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* MiniMap */}
      <div className="p-3">
        <div 
          ref={minimapRef}
          onClick={handleMinimapClick}
          className="relative w-full h-48 bg-gradient-to-b from-gray-50 to-gray-100 rounded-lg border-2 border-gray-200 cursor-pointer overflow-hidden transition-all duration-200 hover:border-blue-300 hover:shadow-md"
          title="Click to navigate • Hover over markers for details"
        >
          {/* Background grid */}
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            {[...Array(8)].map((_, i) => (
              <div 
                key={i}
                className="absolute left-0 right-0 border-t border-gray-300"
                style={{ top: `${(i + 1) * 12.5}%` }}
              />
            ))}
          </div>
          
          {/* Change markers */}
          {markers.map((marker, i) => (
            <div 
              key={`${marker.side}-${i}`}
              className="absolute transition-all duration-200 hover:scale-110 cursor-pointer z-20 rounded-sm"
              style={{ 
                left: marker.side === 'left' ? '2px' : 'calc(50% + 2px)',
                width: 'calc(50% - 4px)',
                top: `${marker.ratio * 100}%`, 
                height: '4px', 
                backgroundColor: marker.color,
                opacity: isScrolling ? 0.9 : 0.8,
                boxShadow: `0 1px 3px ${marker.color}40`
              }}
              title={`${marker.changeType} change on ${marker.side} - click to navigate`}
              onClick={(e) => handleMarkerClick(e, marker)}
            />
          ))}
          
          {/* Center divider */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300 z-10 transform -translate-x-0.5" />
          
          {/* Viewport indicator */}
          <div
            className="absolute left-0 right-0 border-2 border-blue-500 bg-blue-400/20 rounded-sm transition-all duration-300 pointer-events-none z-30"
            style={{ 
              top: `${viewport.top}%`, 
              height: `${Math.max(3, viewport.height)}%`,
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
            }}
          />
          
          {/* Side labels */}
          <div className="absolute top-1 left-1 text-xs font-medium text-gray-500 pointer-events-none z-40">
            L
          </div>
          <div className="absolute top-1 right-1 text-xs font-medium text-gray-500 pointer-events-none z-40">
            R
          </div>
          
          {/* No changes message */}
          {markers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
              <div className="text-xs text-gray-400 text-center bg-white/80 px-3 py-2 rounded-lg">
                No changes detected
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        {markers.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-medium text-gray-700">Changes ({markers.length})</div>
            <div className="grid grid-cols-1 gap-1 text-xs">
              {markersByType.added > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 bg-emerald-500 rounded-sm"></div>
                  <span className="text-gray-600">{markersByType.added} added</span>
                </div>
              )}
              {markersByType.removed > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 bg-red-500 rounded-sm"></div>
                  <span className="text-gray-600">{markersByType.removed} removed</span>
                </div>
              )}
              {markersByType.modified > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 bg-amber-500 rounded-sm"></div>
                  <span className="text-gray-600">{markersByType.modified} modified</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniMap;