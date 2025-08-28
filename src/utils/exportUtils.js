import { renderHtmlDifferences } from './textComparison';
import html2pdf from 'html2pdf.js/dist/html2pdf.bundle.min.js';

export const exportComparisonResults = (
  comparison,
  leftDocument,
  rightDocument
) => {
  const leftHtml = renderHtmlDifferences(comparison.leftDiffs);
  const rightHtml = renderHtmlDifferences(comparison.rightDiffs);

  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      leftDocument: {
        name: leftDocument.name,
        size: leftDocument.file.size,
        lastModified: new Date(leftDocument.file.lastModified).toISOString()
      },
      rightDocument: {
        name: rightDocument.name,
        size: rightDocument.file.size,
        lastModified: new Date(rightDocument.file.lastModified).toISOString()
      }
    },
    summary: comparison.summary,
    comparison: {
      leftContent: leftHtml,
      rightContent: rightHtml
    }
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `document-comparison-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportAsHtml = (
  comparison,
  leftDocument,
  rightDocument
) => {
  const leftHtml = renderHtmlDifferences(comparison.leftDiffs);
  const rightHtml = renderHtmlDifferences(comparison.rightDiffs);

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document Comparison Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .documents { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .document { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .document-header { background: #f8f9fa; padding: 15px; font-weight: bold; }
        .document-content { padding: 20px; max-height: 600px; overflow-y: auto; }
        .diff-insert { background-color: #d4edda; color: #155724; padding: 2px 4px; border-radius: 3px; }
        .diff-delete { background-color: #f8d7da; color: #721c24; padding: 2px 4px; border-radius: 3px; text-decoration: line-through; }
        @media (max-width: 768px) { .documents { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Document Comparison Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <p><strong>Additions:</strong> ${comparison.summary.additions}</p>
        <p><strong>Deletions:</strong> ${comparison.summary.deletions}</p>
        <p><strong>Total Changes:</strong> ${comparison.summary.changes}</p>
    </div>
    
    <div class="documents">
        <div class="document">
            <div class="document-header">Original: ${leftDocument.name}</div>
            <div class="document-content">${leftHtml}</div>
        </div>
        <div class="document">
            <div class="document-header">Modified: ${rightDocument.name}</div>
            <div class="document-content">${rightHtml}</div>
        </div>
    </div>
</body>
</html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `document-comparison-report-${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}; 

export const exportAsPdf = (
  comparison,
  leftDocument,
  rightDocument
) => {
  const leftHtml = renderHtmlDifferences(comparison.leftDiffs);
  const rightHtml = renderHtmlDifferences(comparison.rightDiffs);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div style="font-family: Arial, sans-serif;">
      <div style="text-align:center;margin-bottom:16px;">
        <h2 style="margin:0;">Document Comparison Report</h2>
        <div style="color:#666;font-size:12px;">${new Date().toLocaleString()}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="border:1px solid #ddd;border-radius:8px;overflow:hidden;">
          <div style="background:#f8f9fa;padding:8px 12px;font-weight:bold;">Original: ${leftDocument.name}</div>
          <div style="padding:12px;">${leftHtml}</div>
        </div>
        <div style="border:1px solid #ddd;border-radius:8px;overflow:hidden;">
          <div style="background:#f8f9fa;padding:8px 12px;font-weight:bold;">Modified: ${rightDocument.name}</div>
          <div style="padding:12px;">${rightHtml}</div>
        </div>
      </div>
    </div>
  `;

  const opt = {
    margin:       10,
    filename:     `document-comparison-${Date.now()}.pdf`,
    image:        { type: 'jpeg', quality: 0.95 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  return html2pdf().from(wrapper).set(opt).save();
};