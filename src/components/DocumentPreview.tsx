import React from 'react';
import { DocumentData, DiffResult } from '../types';
import { renderHtmlDifferences } from '../utils/textComparison';

interface DocumentPreviewProps {
	document: DocumentData;
	diffs?: DiffResult[];
	title: string;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({ document, diffs, title }) => {
  // Always use original content for preview, diff-highlighted content for comparison
  const content = diffs ? renderHtmlDifferences(diffs) : document.originalHtmlContent;

	return (
		<div className="h-full flex flex-col bg-white rounded-lg shadow-lg border border-gray-200">
			<div className="border-b border-gray-200 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
				<h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
					<div className="w-3 h-3 bg-blue-500 rounded-full"></div>
					{title}
				</h3>
				<p className="text-sm text-gray-600 truncate mt-1" title={document.name}>
					📄 {document.name}
				</p>
			</div>
			
			<div className="flex-1 overflow-auto">
				<div className="p-8 bg-white min-h-full">
					<div 
						className="word-document-preview"
						dangerouslySetInnerHTML={{ __html: content }}
					/>
				</div>
			</div>
		</div>
	);
};

export default DocumentPreview;