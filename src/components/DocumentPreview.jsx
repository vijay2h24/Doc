import React, { useEffect, useRef } from 'react';
import { renderHtmlDifferences } from '../utils/textComparison';

const DocumentPreview = ({ document, diffs, title, containerId }) => {
  const contentRef = useRef(null);
  const containerRef = useRef(null);

  const content = diffs ? renderHtmlDifferences(diffs) : document.originalHtmlContent;

  // Calculate and apply scale to fit content within preview width while preserving 100% proportions
  useEffect(() => {
    if (contentRef.current && containerRef.current) {
      const calculateScale = () => {
        const contentWidth = contentRef.current.scrollWidth;
        const containerWidth = containerRef.current.clientWidth - 16; // Account for padding
        const scale = Math.min(1, containerWidth / contentWidth);
        
        contentRef.current.style.transform = `scale(${scale})`;
        contentRef.current.style.transformOrigin = 'top left';
        contentRef.current.style.width = `${100 / scale}%`;
      };

      // Calculate scale after content loads
      const timer = setTimeout(calculateScale, 100);
      return () => clearTimeout(timer);
    }
  }, [content]);

  // Sync scroll between left and right containers
  useEffect(() => {
    if (!containerRef.current) return;

    const handleScroll = (e) => {
      const sourceContainer = e.target;
      const sourceId = sourceContainer.id;
      
      // Determine the target container
      const targetId = sourceId.includes('left') 
        ? sourceId.replace('left', 'right') 
        : sourceId.replace('right', 'left');
      const targetContainer = document.getElementById(targetId);
      
      if (targetContainer && targetContainer !== sourceContainer) {
        // Calculate scroll ratio
        const sourceMaxScroll = Math.max(0, sourceContainer.scrollHeight - sourceContainer.clientHeight);
        const targetMaxScroll = Math.max(0, targetContainer.scrollHeight - targetContainer.clientHeight);
        
        if (sourceMaxScroll > 0 && targetMaxScroll > 0) {
          const scrollRatio = sourceContainer.scrollTop / sourceMaxScroll;
          const targetScrollTop = Math.round(targetMaxScroll * scrollRatio);
          
          // Temporarily remove scroll listener to prevent infinite loop
          targetContainer.removeEventListener('scroll', handleScroll);
          targetContainer.scrollTop = targetScrollTop;
          
          // Re-add listener after a short delay
          setTimeout(() => {
            targetContainer.addEventListener('scroll', handleScroll, { passive: true });
          }, 50);
        }
      }
    };

    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [containerId]);

	return (
		<div className="min-w-0 h-full flex flex-col bg-white rounded-lg shadow-lg border border-gray-200">
			<div className="border-b border-gray-200 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
				<h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
					<div className="w-3 h-3 bg-blue-500 rounded-full"></div>
					{title}
				</h3>
				<p className="text-sm text-gray-600 truncate mt-1" title={document.name}>
					📄 {document.name}
				</p>
			</div>
			
			<div className="flex-1 overflow-auto" id={containerId} ref={containerRef}>
				<div className="p-2 bg-white min-h-full">
					<div 
						ref={contentRef}
						className="word-document-preview"
						dangerouslySetInnerHTML={{ __html: content }}
					/>
				</div>
			</div>
		</div>
	);
};

export default DocumentPreview; 