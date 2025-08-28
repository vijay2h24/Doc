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
			
			<div className="flex-1 overflow-auto" id={containerId} onClick={() => jumpToNextChange(containerId)} ref={containerRef}>
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

const jumpToNextChange = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const changeSelectors = ['.git-line-added', '.git-line-removed', '.git-line-modified', '.git-inline-added', '.git-inline-removed'];
  const nodes = changeSelectors.flatMap(sel => Array.from(container.querySelectorAll(sel)));
  if (nodes.length === 0) return;

  const currentTop = container.scrollTop;
  const viewBottom = currentTop + container.clientHeight;

  // find first change that is below current view by small threshold
  const threshold = 8;
  const next = nodes.find(n => (n.offsetTop - threshold) > currentTop && (n.offsetTop) > currentTop);
  const target = next || nodes[0];

  // Align target near top
  container.scrollTop = Math.max(target.offsetTop - 12, 0);
  // Mirror scroll to sibling container if exists
  const siblingId = containerId.includes('left') ? containerId.replace('left', 'right') : containerId.replace('right', 'left');
  const sibling = document.getElementById(siblingId);
  if (sibling) sibling.scrollTop = container.scrollTop;
};

export default DocumentPreview; 