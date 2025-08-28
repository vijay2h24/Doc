import { diffChars, diffWordsWithSpace, diffArrays } from "diff";

export const compareDocuments = (leftText, rightText) => {
  const diffs = diffChars(leftText, rightText);
  const leftDiffs = [];
  const rightDiffs = [];
  let summary = { additions: 0, deletions: 0, changes: 0 };

  diffs.forEach((diff) => {
    if (diff.added) {
      rightDiffs.push({ type: "insert", content: diff.value });
      summary.additions++;
    } else if (diff.removed) {
      leftDiffs.push({ type: "delete", content: diff.value });
      summary.deletions++;
    } else {
      leftDiffs.push({ type: "equal", content: diff.value });
      rightDiffs.push({ type: "equal", content: diff.value });
    }
  });

  summary.changes = summary.additions + summary.deletions;
  return { leftDiffs, rightDiffs, summary };
};

export const compareHtmlDocuments = (leftHtml, rightHtml) => {
  // First, check if documents are identical
  const leftText = extractPlainText(leftHtml);
  const rightText = extractPlainText(rightHtml);
  
  if (leftText.trim() === rightText.trim()) {
    // Documents are identical, return original content without any highlighting
    const leftDiffs = [{ type: "equal", content: leftHtml }];
    const rightDiffs = [{ type: "equal", content: rightHtml }];
    const summary = { additions: 0, deletions: 0, changes: 0 };
    const detailed = { lines: [], tables: [], images: [] };
    return { leftDiffs, rightDiffs, summary, detailed };
  }

  const { leftDomWithImages, rightDomWithImages, structSummary } = applyImageDiffOutlines(leftHtml, rightHtml);
  const leftWithTable = applyTableCellDiffs(leftDomWithImages, rightDomWithImages, "left");
  const rightWithTable = applyTableCellDiffs(rightDomWithImages, leftDomWithImages, "right");

  let summary = { additions: 0, deletions: 0, changes: 0 };
  summary.additions += structSummary.additions;
  summary.deletions += structSummary.deletions;

  const { leftFinal, rightFinal, textSummary } = applyTrueLineByLineComparison(leftWithTable, rightWithTable);
  
  summary.additions += textSummary.additions;
  summary.deletions += textSummary.deletions;
  summary.changes = summary.additions + summary.deletions;

  const detailed = generateDetailedReport(leftHtml, rightHtml);

  const leftDiffs = [{ type: "equal", content: leftFinal }];
  const rightDiffs = [{ type: "equal", content: rightFinal }];

  return { leftDiffs, rightDiffs, summary, detailed };
};

const BLOCK_TAGS = new Set(["p","h1","h2","h3","h4","h5","h6","li","pre","div"]);

const collectLinesWithStructure = (root) => {
  const lines = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let node;
  while ((node = walker.nextNode())) {
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    if (BLOCK_TAGS.has(tag) && !isInsideTable(node) && !isInsideTable(node.parentNode)) {
      const text = (node.textContent || "").trim();
      const computedStyle = window.getComputedStyle ? window.getComputedStyle(node) : {};
      const height = node.offsetHeight || parseInt(computedStyle.lineHeight) || 20;
      
      lines.push({ 
        element: node, 
        text, 
        originalText: text, 
        isEmpty: text.length === 0, 
        tagName: tag,
        height: height,
        styles: {
          fontSize: node.style.fontSize || computedStyle.fontSize || '',
          fontFamily: node.style.fontFamily || computedStyle.fontFamily || '',
          fontWeight: node.style.fontWeight || computedStyle.fontWeight || '',
          color: node.style.color || computedStyle.color || '',
          textAlign: node.style.textAlign || computedStyle.textAlign || '',
          lineHeight: node.style.lineHeight || computedStyle.lineHeight || '',
          margin: node.style.margin || '',
          padding: node.style.padding || '',
          backgroundColor: node.style.backgroundColor || computedStyle.backgroundColor || ''
        }
      });
    }
  }
  return lines;
};

const applyTrueLineByLineComparison = (ownHtml, otherHtml) => {
  const ownDiv = htmlToDiv(ownHtml);
  const otherDiv = htmlToDiv(otherHtml);

  const ownLines = collectLinesWithStructure(ownDiv);
  const otherLines = collectLinesWithStructure(otherDiv);

  const { alignedDiff, summary } = createTrueLineAlignment(ownLines, otherLines);
  
  const leftFinal = applyLineByLineDiffToDOM(ownDiv, alignedDiff.left, "left");
  const rightFinal = applyLineByLineDiffToDOM(otherDiv, alignedDiff.right, "right");
  
  return { leftFinal, rightFinal, textSummary: summary };
};

const createTrueLineAlignment = (leftLines, rightLines) => {
  const leftTexts = leftLines.map(l => l.text || "");
  const rightTexts = rightLines.map(l => l.text || "");
  
  // Only compare non-empty lines for meaningful differences
  const parts = diffArrays(leftTexts, rightTexts, { 
    comparator: (a, b) => a.trim() === b.trim() 
  });

  const leftResult = [];
  const rightResult = [];
  let iLeft = 0;
  let iRight = 0;
  let summary = { additions: 0, deletions: 0 };

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    
    if (part.added) {
      // Lines present only in right document
      for (let k = 0; k < part.value.length; k++) {
        const rightLine = rightLines[iRight + k] || null;
        if (rightLine && rightLine.text.trim()) {
          summary.additions++;
          rightResult.push({ 
            type: 'added', 
            lineNumber: rightResult.length, 
            content: rightLine.text, 
            element: rightLine.element
          });
          // Add placeholder in left
          leftResult.push({ 
            type: 'placeholder', 
            lineNumber: leftResult.length, 
            content: '', 
            element: null, 
            otherLine: rightLine,
            height: rightLine.height
          });
        } else {
          // Empty line, keep as is
          rightResult.push({ 
            type: 'unchanged', 
            lineNumber: rightResult.length, 
            content: rightLine ? rightLine.text : '', 
            element: rightLine ? rightLine.element : null
          });
          leftResult.push({ 
            type: 'placeholder', 
            lineNumber: leftResult.length, 
            content: '', 
            element: null, 
            otherLine: rightLine,
            height: rightLine ? rightLine.height : 20
          });
        }
      }
      iRight += part.count || part.value.length;
      continue;
    }
    
    if (part.removed) {
      // Look ahead to see if next part is added (modification case)
      const next = parts[p + 1];
      if (next && next.added) {
        const removedCount = part.count || part.value.length;
        const addedCount = next.count || next.value.length;
        const pairCount = Math.min(removedCount, addedCount);
        
        // Handle paired modifications
        for (let k = 0; k < pairCount; k++) {
          const leftLine = leftLines[iLeft + k] || null;
          const rightLine = rightLines[iRight + k] || null;
          
          if (leftLine && rightLine && leftLine.text.trim() && rightLine.text.trim()) {
            // Only mark as modified if there's actual content difference
            if (leftLine.text.trim() !== rightLine.text.trim()) {
              summary.deletions++;
              summary.additions++;
              leftResult.push({ 
                type: 'modified', 
                lineNumber: leftResult.length, 
                content: leftLine.text, 
                otherContent: rightLine.text, 
                element: leftLine.element, 
                otherLine: rightLine
              });
              rightResult.push({ 
                type: 'modified', 
                lineNumber: rightResult.length, 
                content: rightLine.text, 
                otherContent: leftLine.text, 
                element: rightLine.element, 
                otherLine: leftLine
              });
            } else {
              // Same content, keep unchanged
              leftResult.push({ 
                type: 'unchanged', 
                lineNumber: leftResult.length, 
                content: leftLine.text, 
                element: leftLine.element
              });
              rightResult.push({ 
                type: 'unchanged', 
                lineNumber: rightResult.length, 
                content: rightLine.text, 
                element: rightLine.element
              });
            }
          } else {
            // Handle empty lines
            leftResult.push({ 
              type: leftLine && leftLine.text.trim() ? 'removed' : 'unchanged', 
              lineNumber: leftResult.length, 
              content: leftLine ? leftLine.text : '', 
              element: leftLine ? leftLine.element : null
            });
            rightResult.push({ 
              type: rightLine && rightLine.text.trim() ? 'added' : 'unchanged', 
              lineNumber: rightResult.length, 
              content: rightLine ? rightLine.text : '', 
              element: rightLine ? rightLine.element : null
            });
          }
        }
        
        // Handle remaining removed lines
        for (let k = pairCount; k < removedCount; k++) {
          const leftLine = leftLines[iLeft + k] || null;
          if (leftLine && leftLine.text.trim()) {
            summary.deletions++;
            leftResult.push({ 
              type: 'removed', 
              lineNumber: leftResult.length, 
              content: leftLine.text, 
              element: leftLine.element
            });
            rightResult.push({ 
              type: 'placeholder', 
              lineNumber: rightResult.length, 
              content: '', 
              element: null, 
              otherLine: leftLine,
              height: leftLine.height
            });
          } else {
            leftResult.push({ 
              type: 'unchanged', 
              lineNumber: leftResult.length, 
              content: leftLine ? leftLine.text : '', 
              element: leftLine ? leftLine.element : null
            });
            rightResult.push({ 
              type: 'placeholder', 
              lineNumber: rightResult.length, 
              content: '', 
              element: null, 
              otherLine: leftLine,
              height: leftLine ? leftLine.height : 20
            });
          }
        }
        
        // Handle remaining added lines
        for (let k = pairCount; k < addedCount; k++) {
          const rightLine = rightLines[iRight + k] || null;
          if (rightLine && rightLine.text.trim()) {
            summary.additions++;
            rightResult.push({ 
              type: 'added', 
              lineNumber: rightResult.length, 
              content: rightLine.text, 
              element: rightLine.element
            });
            leftResult.push({ 
              type: 'placeholder', 
              lineNumber: leftResult.length, 
              content: '', 
              element: null, 
              otherLine: rightLine,
              height: rightLine.height
            });
          } else {
            rightResult.push({ 
              type: 'unchanged', 
              lineNumber: rightResult.length, 
              content: rightLine ? rightLine.text : '', 
              element: rightLine ? rightLine.element : null
            });
            leftResult.push({ 
              type: 'placeholder', 
              lineNumber: leftResult.length, 
              content: '', 
              element: null, 
              otherLine: rightLine,
              height: rightLine ? rightLine.height : 20
            });
          }
        }
        
        iLeft += removedCount;
        iRight += addedCount;
        p++; // Skip the next added part as we've processed it
        continue;
      }
      
      // Pure removals
      for (let k = 0; k < (part.count || part.value.length); k++) {
        const leftLine = leftLines[iLeft + k] || null;
        if (leftLine && leftLine.text.trim()) {
          summary.deletions++;
          leftResult.push({ 
            type: 'removed', 
            lineNumber: leftResult.length, 
            content: leftLine.text, 
            element: leftLine.element
          });
          rightResult.push({ 
            type: 'placeholder', 
            lineNumber: rightResult.length, 
            content: '', 
            element: null, 
            otherLine: leftLine,
            height: leftLine.height
          });
        } else {
          leftResult.push({ 
            type: 'unchanged', 
            lineNumber: leftResult.length, 
            content: leftLine ? leftLine.text : '', 
            element: leftLine ? leftLine.element : null
          });
          rightResult.push({ 
            type: 'placeholder', 
            lineNumber: rightResult.length, 
            content: '', 
            element: null, 
            otherLine: leftLine,
            height: leftLine ? leftLine.height : 20
          });
        }
      }
      iLeft += part.count || part.value.length;
      continue;
    }
    
    // Equal block - unchanged lines
    for (let k = 0; k < (part.count || part.value.length); k++) {
      const leftLine = leftLines[iLeft + k];
      const rightLine = rightLines[iRight + k];
      leftResult.push({ 
        type: 'unchanged', 
        lineNumber: leftResult.length, 
        content: leftLine ? leftLine.text : '', 
        element: leftLine ? leftLine.element : null
      });
      rightResult.push({ 
        type: 'unchanged', 
        lineNumber: rightResult.length, 
        content: rightLine ? rightLine.text : '', 
        element: rightLine ? rightLine.element : null
      });
    }
    iLeft += part.count || part.value.length;
    iRight += part.count || part.value.length;
  }

  return { alignedDiff: { left: leftResult, right: rightResult }, summary };
};

const applyLineByLineDiffToDOM = (container, diffResult, side) => {
  const processedElements = new Set();
  
  diffResult.forEach((diffLine, index) => {
    const type = diffLine.type;

    if (type === 'removed') {
      const element = diffLine.element;
      if (!element || processedElements.has(element)) return;
      processedElements.add(element);
      
      element.classList.add('git-line-removed');
      // Only apply inline diff if there's actual content
      if (element.textContent && element.textContent.trim()) {
        applyInlineWordDiff(element, element.textContent, '', side);
      }
      return;
    }

    if (type === 'added') {
      const element = diffLine.element;
      if (!element || processedElements.has(element)) return;
      processedElements.add(element);
      
      element.classList.add('git-line-added');
      // Only apply inline diff if there's actual content
      if (element.textContent && element.textContent.trim()) {
        applyInlineWordDiff(element, '', element.textContent, side);
      }
      return;
    }

    if (type === 'modified') {
      const element = diffLine.element;
      if (!element || processedElements.has(element)) return;
      processedElements.add(element);
      
      const ownText = element.textContent || '';
      const otherText = diffLine.otherContent || '';
      
      // Only apply modification highlighting if content actually differs
      if (ownText.trim() !== otherText.trim()) {
        element.classList.add('git-line-modified');
        applyInlineWordDiff(element, ownText, otherText, side);
      }
      return;
    }

    if (type === 'placeholder') {
      // Create a placeholder element that matches the height and style of the corresponding line
      const otherLine = diffLine.otherLine;
      const placeholder = document.createElement(otherLine ? otherLine.tagName : 'div');
      
      // Apply similar styling to maintain document structure
      if (otherLine && otherLine.styles) {
        Object.entries(otherLine.styles).forEach(([prop, value]) => {
          if (value) {
            placeholder.style[prop] = value;
          }
        });
      }
      
      // Set minimum height to match the other document's line
      const height = diffLine.height || 20;
      placeholder.style.minHeight = `${height}px`;
      placeholder.style.height = `${height}px`;
      
      // Add placeholder styling
      placeholder.classList.add('git-line-placeholder');
      placeholder.innerHTML = '&nbsp;'; // Non-breaking space to maintain line height
      
      // Insert placeholder at the correct position
      const existingElements = Array.from(container.querySelectorAll(Array.from(BLOCK_TAGS).join(',')))
        .filter(el => !isInsideTable(el));
      
      if (index < existingElements.length) {
        existingElements[index].parentNode.insertBefore(placeholder, existingElements[index]);
      } else {
        container.appendChild(placeholder);
      }
      return;
    }

    // For unchanged lines, do nothing - preserve original formatting
  });
  
  return container.innerHTML;
};

const applyInlineWordDiff = (element, ownText, otherText, side) => {
  // Only apply inline diff if there's meaningful content difference
  if (!ownText.trim() && !otherText.trim()) {
    return; // Both empty, no diff needed
  }
  
  if (ownText.trim() === otherText.trim()) {
    return; // Same content, no diff needed
  }

  const diffs = diffWordsWithSpace(ownText || '', otherText || '');

  // Check if there are actual differences
  const hasChanges = diffs.some(diff => diff.added || diff.removed);
  if (!hasChanges) {
    return; // No actual changes, preserve original
  }

  // Store original HTML structure
  const originalHTML = element.innerHTML;
  element.innerHTML = '';

  let hasContent = false;

  diffs.forEach((diff) => {
    const span = document.createElement('span');
    
    if (diff.added && side === 'right') {
      span.className = 'git-inline-added';
      span.textContent = diff.value;
      hasContent = true;
    } else if (diff.removed && side === 'left') {
      span.className = 'git-inline-removed';
      span.textContent = diff.value;
      hasContent = true;
    } else if (!diff.added && !diff.removed) {
      span.textContent = diff.value;
      if (diff.value.trim()) hasContent = true;
    } else {
      // Don't show additions on left side or removals on right side
      return;
    }
    
    element.appendChild(span);
  });

  // If no meaningful content was added, restore original
  if (!hasContent) {
    element.innerHTML = originalHTML;
  } else if (!element.textContent.trim()) {
    element.innerHTML = '&nbsp;';
  }
};

const applyImageDiffOutlines = (leftHtml, rightHtml) => {
  const leftDiv = htmlToDiv(leftHtml);
  const rightDiv = htmlToDiv(rightHtml);

  const leftImgs = Array.from(leftDiv.querySelectorAll("img"));
  const rightImgs = Array.from(rightDiv.querySelectorAll("img"));

  let additions = 0, deletions = 0;

  const max = Math.max(leftImgs.length, rightImgs.length);
  for (let i = 0; i < max; i++) {
    const li = leftImgs[i];
    const ri = rightImgs[i];
    if (li && !ri) {
      li.classList.add("structural-removed");
      deletions++;
    }
    else if (!li && ri) {
      ri.classList.add("structural-added");
      additions++;
    }
    else if (li && ri) {
      const leftSrc = li.getAttribute("src") || "";
      const rightSrc = ri.getAttribute("src") || "";
      if (leftSrc !== rightSrc) {
        li.classList.add("structural-modified");
        ri.classList.add("structural-modified");
        additions++; 
        deletions++;
      }
    }
  }

  return {
    leftDomWithImages: leftDiv.innerHTML,
    rightDomWithImages: rightDiv.innerHTML,
    structSummary: { additions, deletions }
  };
};

const applyTableCellDiffs = (ownHtml, otherHtml, side) => {
  const ownDiv = htmlToDiv(ownHtml);
  const otherDiv = htmlToDiv(otherHtml);

  const ownTables = Array.from(ownDiv.querySelectorAll("table"));
  const otherTables = Array.from(otherDiv.querySelectorAll("table"));

  const count = Math.max(ownTables.length, otherTables.length);
  for (let t = 0; t < count; t++) {
    const ot = ownTables[t];
    const xt = otherTables[t];
    if (!ot) continue;

    const ownRows = Array.from(ot.rows || []);
    const otherRows = Array.from(xt ? xt.rows : []);
    const rowCount = Math.max(ownRows.length, otherRows.length);

    for (let r = 0; r < rowCount; r++) {
      const orow = ownRows[r];
      const xrow = otherRows[r];
      if (!orow) continue;

      const ownCells = Array.from(orow.cells || []);
      const otherCells = Array.from(xrow ? xrow.cells : []);
      const colCount = Math.max(ownCells.length, otherCells.length);

      for (let c = 0; c < colCount; c++) {
        const oc = ownCells[c];
        const xc = otherCells[c];
        if (!oc) continue;

        const ownText = (oc.textContent || "").trim();
        const otherText = (xc ? xc.textContent : "").trim();

        if (!xc && ownText) {
          if (side === "left") {
            oc.classList.add("git-cell-removed");
            orow.classList.add("git-line-removed");
          }
          continue;
        }
        
        if (xc && !ownText && otherText && side === "right") {
          oc.classList.add("git-cell-added");
          orow.classList.add("git-line-added");
          continue;
        }

        if (xc && ownText && otherText && ownText !== otherText) {
          oc.classList.add("git-cell-modified");
          applyInlineWordDiff(oc, ownText, otherText, side);
        }
      }
    }
  }

  return ownDiv.innerHTML;
};

const isInsideTable = (node) => {
  let p = node.parentNode;
  while (p) {
    if (p.nodeType === 1) {
      const tag = p.tagName && p.tagName.toLowerCase();
      if (tag === 'table' || tag === 'thead' || tag === 'tbody' || tag === 'tr' || tag === 'td' || tag === 'th') {
        return true;
      }
    }
    p = p.parentNode;
  }
  return false;
};

const htmlToDiv = (html) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
};

const extractPlainText = (html) => {
  if (!html) return "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  const text = tempDiv.textContent || "";
  return text;
};

export const renderHtmlDifferences = (diffs) => {
  return diffs.map((d) => d.content).join("");
};

export const highlightDifferences = (diffs) => {
  return diffs
    .map((diff) => {
      switch (diff.type) {
        case "insert":
          return `<span class=\"diff-insert\">${escapeHtml(diff.content)}</span>`;
        case "delete":
          return `<span class=\"diff-delete\">${escapeHtml(diff.content)}</span>`;
        default:
          return escapeHtml(diff.content);
      }
    })
    .join("");
};

const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}; 

// ===== Detailed line-by-line report =====
const BLOCK_SELECTOR = Array.from(BLOCK_TAGS).join(',');

const extractLineFeatures = (element) => {
  // Gather formatting flags inside the block
  const hasBold = !!element.querySelector('b,strong');
  const hasItalic = !!element.querySelector('i,em');
  const hasUnderline = !!element.querySelector('u');
  const inlineFont = element.style && element.style.fontSize ? element.style.fontSize : '';
  let fontSize = inlineFont || '';
  let textAlign = element.style && element.style.textAlign ? element.style.textAlign : '';
  // fallback to attribute or class hints
  if (!textAlign) {
    const alignAttr = element.getAttribute && element.getAttribute('align');
    if (alignAttr) textAlign = alignAttr;
  }
  return { hasBold, hasItalic, hasUnderline, fontSize, textAlign };
};

const collectBlockLinesWithFormat = (root) => {
  const blocks = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
  return blocks.filter(b => !isInsideTable(b)).map((el, idx) => {
    const text = el.textContent || '';
    const fmt = extractLineFeatures(el);
    return { index: idx, text, fmt, element: el };
  });
};

const visibleSpaces = (s) => {
  if (!s) return '';
  return s.replace(/ /g, '<span class="ws">·</span>').replace(/\t/g, '<span class="ws">→</span>');
};

const inlineDiffHtml = (a, b) => {
  const parts = diffWordsWithSpace(a || '', b || '');
  return parts.map(p => {
    const val = visibleSpaces(escapeHtml(p.value || ''));
    if (p.added) return `<span class="git-inline-added">${val}</span>`;
    if (p.removed) return `<span class="git-inline-removed">${val}</span>`;
    return val;
  }).join('');
};

const compareFormat = (fa, fb) => {
  const changes = [];
  if (!!fa.hasBold !== !!fb.hasBold) changes.push(`bold: ${fa.hasBold ? 'on' : 'off'} → ${fb.hasBold ? 'on' : 'off'}`);
  if (!!fa.hasItalic !== !!fb.hasItalic) changes.push(`italic: ${fa.hasItalic ? 'on' : 'off'} → ${fb.hasItalic ? 'on' : 'off'}`);
  if (!!fa.hasUnderline !== !!fb.hasUnderline) changes.push(`underline: ${fa.hasUnderline ? 'on' : 'off'} → ${fb.hasUnderline ? 'on' : 'off'}`);
  if ((fa.fontSize || '') !== (fb.fontSize || '')) changes.push(`font-size: ${fa.fontSize || 'auto'} → ${fb.fontSize || 'auto'}`);
  if ((fa.textAlign || '') !== (fb.textAlign || '')) changes.push(`alignment: ${fa.textAlign || 'auto'} → ${fb.textAlign || 'auto'}`);
  return changes;
};

export const generateDetailedReport = (leftHtml, rightHtml) => {
  const L = htmlToDiv(leftHtml);
  const R = htmlToDiv(rightHtml);

  const leftLines = collectBlockLinesWithFormat(L);
  const rightLines = collectBlockLinesWithFormat(R);

  const leftTexts = leftLines.map(l => l.text || '');
  const rightTexts = rightLines.map(l => l.text || '');
  const parts = diffArrays(leftTexts, rightTexts, { comparator: (a, b) => a === b });

  const lines = [];
  let iL = 0, iR = 0, v1 = 1, v2 = 1;

  for (const part of parts) {
    const count = part.count || (part.value ? part.value.length : 0);
    if (part.added) {
      for (let k = 0; k < count; k++) {
        const r = rightLines[iR++];
        if (r && r.text.trim()) {
          lines.push({ v1: '', v2: String(v2++), status: 'ADDED', diffHtml: inlineDiffHtml('', r.text), formatChanges: [`added line`] });
        }
      }
      continue;
    }
    if (part.removed) {
      for (let k = 0; k < count; k++) {
        const l = leftLines[iL++];
        if (l && l.text.trim()) {
          lines.push({ v1: String(v1++), v2: '', status: 'REMOVED', diffHtml: inlineDiffHtml(l.text, ''), formatChanges: [`removed line`] });
        }
      }
      continue;
    }
    // unchanged block - may still be formatting-only differences when synced positions differ in formatting
    for (let k = 0; k < count; k++) {
      const l = leftLines[iL++];
      const r = rightLines[iR++];
      if (!l || !r) continue;
      
      const textEqual = (l.text || '').trim() === (r.text || '').trim();
      const fmtChanges = compareFormat(l.fmt, r.fmt);
      
      if (textEqual && fmtChanges.length > 0) {
        lines.push({ v1: String(v1++), v2: String(v2++), status: 'FORMATTING-ONLY', diffHtml: visibleSpaces(escapeHtml(l.text || '')), formatChanges: fmtChanges });
      } else if (textEqual) {
        lines.push({ v1: String(v1++), v2: String(v2++), status: 'UNCHANGED', diffHtml: visibleSpaces(escapeHtml(l.text || '')), formatChanges: [] });
      } else if (l.text.trim() || r.text.trim()) {
        lines.push({ v1: String(v1++), v2: String(v2++), status: 'MODIFIED', diffHtml: inlineDiffHtml(l.text, r.text), formatChanges: fmtChanges });
      }
    }
  }

  // Tables report
  const tableReport = [];
  const Lt = Array.from(L.querySelectorAll('table'));
  const Rt = Array.from(R.querySelectorAll('table'));
  const tcount = Math.max(Lt.length, Rt.length);
  for (let ti = 0; ti < tcount; ti++) {
    const TL = Lt[ti], TR = Rt[ti];
    if (!TL && TR) { tableReport.push({ table: ti+1, status: 'ADDED' }); continue; }
    if (TL && !TR) { tableReport.push({ table: ti+1, status: 'REMOVED' }); continue; }
    if (!(TL && TR)) continue;
    const rL = Array.from(TL.rows || []);
    const rR = Array.from(TR.rows || []);
    const rcount = Math.max(rL.length, rR.length);
    for (let ri = 0; ri < rcount; ri++) {
      const rowL = rL[ri], rowR = rR[ri];
      if (!rowL && rowR) { tableReport.push({ table: ti+1, row: ri+1, status: 'ADDED' }); continue; }
      if (rowL && !rowR) { tableReport.push({ table: ti+1, row: ri+1, status: 'REMOVED' }); continue; }
      const cL = Array.from(rowL.cells || []);
      const cR = Array.from(rowR.cells || []);
      const ccount = Math.max(cL.length, cR.length);
      for (let ci = 0; ci < ccount; ci++) {
        const cellL = cL[ci], cellR = cR[ci];
        if (!cellL && cellR) { tableReport.push({ table: ti+1, row: ri+1, col: ci+1, status: 'ADDED' }); continue; }
        if (cellL && !cellR) { tableReport.push({ table: ti+1, row: ri+1, col: ci+1, status: 'REMOVED' }); continue; }
        const a = (cellL.textContent || '').trim();
        const b = (cellR.textContent || '').trim();
        if (a && b && a !== b) {
          tableReport.push({ table: ti+1, row: ri+1, col: ci+1, status: 'MODIFIED', diffHtml: inlineDiffHtml(a, b) });
        }
      }
    }
  }

  // Images report
  const Li = Array.from(L.querySelectorAll('img')).map(i => i.getAttribute('src') || '');
  const Ri = Array.from(R.querySelectorAll('img')).map(i => i.getAttribute('src') || '');
  const imgReport = [];
  const imax = Math.max(Li.length, Ri.length);
  for (let i = 0; i < imax; i++) {
    const a = Li[i], b = Ri[i];
    if (a && !b) imgReport.push({ index: i+1, status: 'REMOVED', src: a });
    else if (!a && b) imgReport.push({ index: i+1, status: 'ADDED', src: b });
    else if (a && b && a !== b) imgReport.push({ index: i+1, status: 'REPLACED', from: a, to: b });
  }

  return { lines, tables: tableReport, images: imgReport };
};