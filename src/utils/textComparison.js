import { diffChars, diffWordsWithSpace } from "diff";

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
  console.log("compareHtmlDocuments called");
  console.log("Left HTML length:", leftHtml?.length);
  console.log("Right HTML length:", rightHtml?.length);
  
  // 1) Character-level diff for more precision
  const leftText = extractPlainText(leftHtml);
  const rightText = extractPlainText(rightHtml);
  console.log("Left text length:", leftText?.length);
  console.log("Right text length:", rightText?.length);
  
  const textDiffs = diffChars(leftText, rightText);
  console.log("Text diffs count:", textDiffs.length);

  // 2) Structural: images + precise table cell diffs (DOM-based)
  console.log("Applying image diff outlines...");
  const { leftDomWithImages, rightDomWithImages, structSummary } = applyImageDiffOutlines(leftHtml, rightHtml);
  console.log("Image diff summary:", structSummary);
  
  console.log("Applying table cell diffs...");
  const leftWithTable = applyTableCellDiffs(leftDomWithImages, rightDomWithImages, "left");
  const rightWithTable = applyTableCellDiffs(rightDomWithImages, leftDomWithImages, "right");
  console.log("Table diffs applied");

  // 3) Summary
  let summary = { additions: 0, deletions: 0, changes: 0 };
  textDiffs.forEach((d) => {
    if (d.added) summary.additions++;
    if (d.removed) summary.deletions++;
  });
  summary.additions += structSummary.additions;
  summary.deletions += structSummary.deletions;
  summary.changes = summary.additions + summary.deletions;
  console.log("Summary calculated:", summary);

  // 4) Git-like line-by-line comparison with inline highlighting
  console.log("Starting Git-like line comparison...");
  const leftFinal = applyGitLikeLineComparison(leftWithTable, rightWithTable, "left");
  const rightFinal = applyGitLikeLineComparison(rightWithTable, leftWithTable, "right");
  console.log("Line comparison completed");

  const leftDiffs = [{ type: "equal", content: leftFinal }];
  const rightDiffs = [{ type: "equal", content: rightFinal }];

  const result = { leftDiffs, rightDiffs, summary };
  console.log("Final result:", result);
  return result;
};

// === Git-like line-by-line comparison ===
const BLOCK_TAGS = new Set(["p","h1","h2","h3","h4","h5","h6","li","pre","div"]);

const collectLines = (root) => {
  console.log("collectLines called with root:", root);
  const lines = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let node;
  let nodeCount = 0;
  while ((node = walker.nextNode())) {
    nodeCount++;
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    if (BLOCK_TAGS.has(tag) && !isInsideTable(node) && !isInsideTable(node.parentNode)) {
      const text = node.textContent || "";
      // Include even empty lines for comparison
      lines.push({ 
        element: node, 
        text: text, // Don't trim - preserve exact spacing
        originalText: text,
        isEmpty: text.trim().length === 0,
        tagName: tag
      });
    }
  }
  console.log(`collectLines: Processed ${nodeCount} nodes, found ${lines.length} lines`);
  return lines;
};

const applyGitLikeLineComparison = (ownHtml, otherHtml, side) => {
  console.log(`applyGitLikeLineComparison called for ${side} side`);
  console.log(`Own HTML length: ${ownHtml?.length}, Other HTML length: ${otherHtml?.length}`);
  
  const ownDiv = htmlToDiv(ownHtml);
  const otherDiv = htmlToDiv(otherHtml);

  const ownLines = collectLines(ownDiv);
  const otherLines = collectLines(otherDiv);
  console.log(`${side} side: Own lines: ${ownLines.length}, Other lines: ${otherLines.length}`);

  // Create a Git-like diff structure
  const diffResult = createGitLikeDiff(ownLines, otherLines, side);
  console.log(`${side} side: Git-like diff created with ${diffResult.length} lines`);

  // SUMMARY LOGGING: counts by type
  const counts = diffResult.reduce((acc, l) => { acc[l.type] = (acc[l.type] || 0) + 1; return acc; }, {});
  console.log(`${side} side: line types detected ->`, counts);
  // SAMPLE LINES LOGGING (first 10)
  diffResult.slice(0, 10).forEach((l, idx) => {
    if (l.type === 'modified') {
      console.log(`[${side}] #${idx} line ${l.lineNumber} modified:`, { ownPreview: (l.ownContent||'').slice(0,80), otherPreview: (l.otherContent||'').slice(0,80) });
    } else {
      console.log(`[${side}] #${idx} line ${l.lineNumber} ${l.type}:`, (l.content||'').slice(0,120));
    }
  });

  // Apply the diff to the DOM
  applyGitLikeDiffToDOM(ownDiv, diffResult, side);
  
  const result = ownDiv.innerHTML;
  console.log(`${side} side: Git-like comparison completed, result length: ${result.length}`);
  return result;
};

const createGitLikeDiff = (ownLines, otherLines, side) => {
  const diffResult = [];
  const maxLines = Math.max(ownLines.length, otherLines.length);
  
  for (let i = 0; i < maxLines; i++) {
    const ownLine = ownLines[i] || null;
    const otherLine = otherLines[i] || null;
    
    if (!ownLine && otherLine) {
      // Line exists only in other document (ADDED)
      diffResult.push({
        type: 'added',
        lineNumber: i,
        content: otherLine.text,
        element: otherLine.element,
        isEmpty: otherLine.isEmpty
      });
    } else if (ownLine && !otherLine) {
      // Line exists only in own document (REMOVED)
      diffResult.push({
        type: 'removed',
        lineNumber: i,
        content: ownLine.text,
        element: ownLine.element,
        isEmpty: ownLine.isEmpty
      });
    } else if (ownLine && otherLine) {
      // Both exist, compare content
      if (ownLine.text === otherLine.text) {
        // Lines are identical (UNCHANGED)
        diffResult.push({
          type: 'unchanged',
          lineNumber: i,
          content: ownLine.text,
          element: ownLine.element,
          isEmpty: ownLine.isEmpty
        });
      } else {
        // Lines have differences (MODIFIED)
        diffResult.push({
          type: 'modified',
          lineNumber: i,
          ownContent: ownLine.text,
          otherContent: otherLine.text,
          element: ownLine.element,
          isEmpty: ownLine.isEmpty
        });
      }
    }
  }
  
  // FINAL LOGGING of line diff counts
  const cnt = diffResult.reduce((acc, l) => { acc[l.type] = (acc[l.type] || 0) + 1; return acc; }, {});
  console.log("Line diff summary (all):", cnt);

  return diffResult;
};

const applyGitLikeDiffToDOM = (container, diffResult, side) => {
  diffResult.forEach((diffLine) => {
    const element = diffLine.element;
    if (!element) return;
    
    switch (diffLine.type) {
      case 'added':
        if (side === 'right') {
          // Add green background for added lines
          element.classList.add('git-line-added');
          // Add inline highlighting for the added content
          applyInlineHighlighting(element, diffLine.content, 'added');
        }
        break;
        
      case 'removed':
        if (side === 'left') {
          // Add red background for removed lines
          element.classList.add('git-line-removed');
          // Add inline highlighting for the removed content
          applyInlineHighlighting(element, diffLine.content, 'removed');
        }
        break;
        
      case 'modified':
        // Apply inline diff highlighting to show what changed within the line
        applyInlineDiffHighlighting(element, diffLine.ownContent, diffLine.otherContent, side);
        break;
        
      case 'unchanged':
        // No highlighting needed for unchanged lines
        break;
    }
  });
};

const applyInlineHighlighting = (element, content, type) => {
  // For added/removed lines, highlight the entire line while preserving original structure
  const wrapper = document.createElement('span');
  wrapper.className = type === 'added' ? 'git-inline-added' : 'git-inline-removed';

  // Move existing child nodes into the wrapper to preserve HTML and spacing
  if (element.childNodes && element.childNodes.length > 0) {
    const children = Array.from(element.childNodes);
    children.forEach((child) => wrapper.appendChild(child));
  } else {
    // Fallback: if nothing to move, use the provided content
    wrapper.textContent = content || '';
  }

  element.appendChild(wrapper);
};

const applyInlineDiffHighlighting = (element, ownText, otherText, side) => {
  // If the element contains nested elements, avoid rewriting inner HTML to preserve formatting.
  // Instead, mark the whole line as modified.
  if (element.querySelector('*')) {
    element.classList.add('git-line-modified');
    return;
  }

  // Word+space aware diff for better readability and whitespace precision
  const diffs = diffWordsWithSpace(ownText, otherText);

  // Clear existing content safely for plain-text nodes
  element.textContent = '';

  diffs.forEach((diff) => {
    if (diff.added && side === 'right') {
      const span = document.createElement('span');
      span.className = 'git-inline-added';
      span.textContent = diff.value;
      element.appendChild(span);
    } else if (diff.removed && side === 'left') {
      const span = document.createElement('span');
      span.className = 'git-inline-removed';
      span.textContent = diff.value;
      element.appendChild(span);
    } else if (!diff.added && !diff.removed) {
      element.appendChild(document.createTextNode(diff.value));
    }
  });
};

// === Table detection helper ===
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

// === Images: add outlines for add/remove/modify ===
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
      console.log(`Image removed at index ${i}`);
      li.classList.add("structural-removed");
      deletions++;
    }
    else if (!li && ri) {
      console.log(`Image added at index ${i}`);
      ri.classList.add("structural-added");
      additions++;
    }
    else if (li && ri && (li.getAttribute("src") || "") !== (ri.getAttribute("src") || "")) {
      console.log(`Image modified at index ${i}`);
      li.classList.add("structural-modified");
      ri.classList.add("structural-modified");
      additions++; deletions++;
    }
  }

  console.log("Image changes detected:", { additions, deletions });
  return {
    leftDomWithImages: leftDiv.innerHTML,
    rightDomWithImages: rightDiv.innerHTML,
    structSummary: { additions, deletions }
  };
};

// === Tables: Git-like cell-by-cell diff ===
const applyTableCellDiffs = (ownHtml, otherHtml, side) => {
  const ownDiv = htmlToDiv(ownHtml);
  const otherDiv = htmlToDiv(otherHtml);

  const ownTables = Array.from(ownDiv.querySelectorAll("table"));
  const otherTables = Array.from(otherDiv.querySelectorAll("table"));

  const count = Math.max(ownTables.length, otherTables.length);
  console.log(`Table comparison (${side}) - own: ${ownTables.length}, other: ${otherTables.length}`);
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

        const ownText = (oc.textContent || "");
        const otherText = (xc ? xc.textContent : "");

        if (!xc && side === "left") {
          console.log(`Table cell removed at [row ${r}, col ${c}]`, { ownText });
          oc.classList.add("git-cell-removed");
          continue;
        }
        if (xc && !ownText && otherText && side === "right") {
          console.log(`Table cell added at [row ${r}, col ${c}]`, { otherText });
          oc.classList.add("git-cell-added");
        }

        if (xc && ownText !== otherText) {
          console.log(`Table cell modified at [row ${r}, col ${c}]`, { ownTextPreview: ownText.slice(0,80), otherTextPreview: otherText.slice(0,80) });
          // Apply Git-like inline diffing to table cells
          applyInlineDiffHighlighting(oc, ownText, otherText, side);
          oc.classList.add("git-cell-modified");
        }
      }
    }
  }

  return ownDiv.innerHTML;
};

// Helpers
const htmlToDiv = (html) => {
  console.log("htmlToDiv called with HTML length:", html?.length);
  if (!html) {
    console.warn("htmlToDiv: HTML is null or undefined");
    return document.createElement("div");
  }
  
  const d = document.createElement("div");
  d.innerHTML = html;
  console.log("htmlToDiv: Created div with child nodes:", d.childNodes.length);
  return d;
};

// Extract plain text for comparison
const extractPlainText = (html) => {
  console.log("extractPlainText called with HTML length:", html?.length);
  if (!html) {
    console.warn("extractPlainText: HTML is null or undefined");
    return "";
  }
  
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  const text = tempDiv.textContent || "";
  console.log("extractPlainText result length:", text?.length);
  return text;
};

// Render differences with preserved formatting (content already contains highlights)
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