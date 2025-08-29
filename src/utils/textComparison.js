import { diffChars, diffWordsWithSpace, diffArrays, diffSentences } from "diff";

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
  try {
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

    // Check if we're in a browser environment
    if (typeof document === "undefined") {
      console.error("Document comparison requires browser environment");
      return {
        leftDiffs: [{ type: "equal", content: leftHtml }],
        rightDiffs: [{ type: "equal", content: rightHtml }],
        summary: { additions: 0, deletions: 0, changes: 0 },
        detailed: { lines: [], tables: [], images: [] },
      };
    }

    // Apply structural comparisons first
    const { leftDomWithImages, rightDomWithImages, structSummary } =
      applyImageDiffOutlines(leftHtml, rightHtml);
    const leftWithTable = applyTableCellDiffs(
      leftDomWithImages,
      rightDomWithImages,
      "left"
    );
    const rightWithTable = applyTableCellDiffs(
      rightDomWithImages,
      leftDomWithImages,
      "right"
    );

    let summary = { additions: 0, deletions: 0, changes: 0 };
    summary.additions += structSummary.additions;
    summary.deletions += structSummary.deletions;

    // Apply word-level text comparison
    const { leftFinal, rightFinal, textSummary } =
      applyWordLevelTextComparison(leftWithTable, rightWithTable);

    summary.additions += textSummary.additions;
    summary.deletions += textSummary.deletions;
    summary.changes = summary.additions + summary.deletions;

    const detailed = generateDetailedReport(leftHtml, rightHtml);

    const leftDiffs = [{ type: "equal", content: leftFinal }];
    const rightDiffs = [{ type: "equal", content: rightFinal }];

    return { leftDiffs, rightDiffs, summary, detailed };
  } catch (error) {
    console.error("Error during document comparison:", error);
    // Return original content on error
    return {
      leftDiffs: [{ type: "equal", content: leftHtml }],
      rightDiffs: [{ type: "equal", content: rightHtml }],
      summary: { additions: 0, deletions: 0, changes: 0 },
      detailed: { lines: [], tables: [], images: [] },
    };
  }
};

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "pre",
  "div",
]);

// Word-level text comparison with better sensitivity
const applyWordLevelTextComparison = (leftHtml, rightHtml) => {
  const leftDiv = htmlToDiv(leftHtml);
  const rightDiv = htmlToDiv(rightHtml);

  // Extract all text blocks
  const leftBlocks = extractTextBlocks(leftDiv);
  const rightBlocks = extractTextBlocks(rightDiv);

  // Extract words from each block for word-level comparison
  const leftWords = leftBlocks.map(block => ({
    ...block,
    words: extractWords(block.text)
  }));
  const rightWords = rightBlocks.map(block => ({
    ...block,
    words: extractWords(block.text)
  }));

  // Flatten for word-level comparison
  const leftFlat = leftWords.flatMap(block => 
    block.words.map(word => ({ ...block, text: word, originalBlock: block }))
  );
  const rightFlat = rightWords.flatMap(block => 
    block.words.map(word => ({ ...block, text: word, originalBlock: block }))
  );

  const leftTexts = leftFlat.map(item => item.text.trim());
  const rightTexts = rightFlat.map(item => item.text.trim());

  // Use word-level comparison
  const diffs = diffArrays(leftTexts, rightTexts, {
    comparator: (a, b) => {
      // Normalize for comparison but keep case sensitivity for display
      const normalizeWord = (word) => word.replace(/[^\w]/g, '').toLowerCase();
      return normalizeWord(a) === normalizeWord(b);
    }
  });

  let summary = { additions: 0, deletions: 0 };
  let leftIndex = 0;
  let rightIndex = 0;

  // Group changes by element for better highlighting
  const leftElementChanges = new Map();
  const rightElementChanges = new Map();

  diffs.forEach(diff => {
    if (diff.added) {
      // Mark added words in right document
      for (let i = 0; i < diff.count; i++) {
        const item = rightFlat[rightIndex + i];
        if (item && item.element && item.text.trim()) {
          if (!rightElementChanges.has(item.element)) {
            rightElementChanges.set(item.element, { added: [], removed: [], original: item.originalBlock.text });
          }
          rightElementChanges.get(item.element).added.push(item.text);
          summary.additions++;
        }
      }
      rightIndex += diff.count;
    } else if (diff.removed) {
      // Mark removed words in left document
      for (let i = 0; i < diff.count; i++) {
        const item = leftFlat[leftIndex + i];
        if (item && item.element && item.text.trim()) {
          if (!leftElementChanges.has(item.element)) {
            leftElementChanges.set(item.element, { added: [], removed: [], original: item.originalBlock.text });
          }
          leftElementChanges.get(item.element).removed.push(item.text);
          summary.deletions++;
        }
      }
      leftIndex += diff.count;
    } else {
      // Check for modifications within unchanged blocks
      for (let i = 0; i < diff.count; i++) {
        const leftItem = leftFlat[leftIndex + i];
        const rightItem = rightFlat[rightIndex + i];
        
        if (leftItem && rightItem && leftItem.element && rightItem.element) {
          const leftWord = leftItem.text.trim();
          const rightWord = rightItem.text.trim();
          
          // Word-level comparison
          if (leftWord && rightWord && !areWordsEquivalent(leftWord, rightWord)) {
            if (!leftElementChanges.has(leftItem.element)) {
              leftElementChanges.set(leftItem.element, { added: [], removed: [], original: leftItem.originalBlock.text });
            }
            if (!rightElementChanges.has(rightItem.element)) {
              rightElementChanges.set(rightItem.element, { added: [], removed: [], original: rightItem.originalBlock.text });
            }
            
            leftElementChanges.get(leftItem.element).removed.push(leftWord);
            rightElementChanges.get(rightItem.element).added.push(rightWord);
            summary.deletions++;
            summary.additions++;
          }
        }
      }
      leftIndex += diff.count;
      rightIndex += diff.count;
    }
  });

  // Apply word-level highlighting to elements
  leftElementChanges.forEach((changes, element) => {
    if (changes.added.length > 0 || changes.removed.length > 0) {
      element.classList.add("git-line-modified");
      applyWordLevelHighlighting(element, changes.original, changes.added, changes.removed, "left");
    }
  });

  rightElementChanges.forEach((changes, element) => {
    if (changes.added.length > 0 || changes.removed.length > 0) {
      element.classList.add("git-line-modified");
      applyWordLevelHighlighting(element, changes.original, changes.added, changes.removed, "right");
    }
  });

  return {
    leftFinal: leftDiv.innerHTML,
    rightFinal: rightDiv.innerHTML,
    textSummary: summary
  };
};

// Extract text blocks with better granularity
const extractTextBlocks = (container) => {
  const blocks = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        const tagName = node.tagName.toLowerCase();
        return BLOCK_TAGS.has(tagName) && !isInsideTable(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || "").trim();
    if (text) {
      blocks.push({
        element: node,
        text: text,
        tagName: node.tagName.toLowerCase()
      });
    }
  }

  return blocks;
};

// Extract words for word-level comparison
const extractWords = (text) => {
  if (!text || !text.trim()) return [""];
  
  // Split by word boundaries while preserving punctuation context
  const words = text.split(/(\s+)/)
    .filter(word => word.length > 0);
  
  return words.length > 0 ? words : [text];
};

// Word-level equivalence check
const areWordsEquivalent = (word1, word2) => {
  // Normalize punctuation and case for comparison
  const normalize = (word) => {
    return word
      .replace(/[""'']/g, '"')
      .replace(/[–—]/g, '-')
      .trim()
      .toLowerCase();
  };
  
  return normalize(word1) === normalize(word2);
};

// Apply word-level highlighting to elements
const applyWordLevelHighlighting = (element, originalText, addedWords, removedWords, side) => {
  if (!originalText.trim()) return;

  // Use word-level diff on the original text
  const words = originalText.split(/(\s+)/);
  const highlightedWords = [];

  words.forEach(word => {
    const trimmedWord = word.trim();
    if (!trimmedWord) {
      // Preserve whitespace
      highlightedWords.push(word);
      return;
    }

    const isAdded = addedWords.some(addedWord => areWordsEquivalent(trimmedWord, addedWord.trim()));
    const isRemoved = removedWords.some(removedWord => areWordsEquivalent(trimmedWord, removedWord.trim()));

    if (isAdded && side === "right") {
      highlightedWords.push(`<span class="git-inline-added">${escapeHtml(word)}</span>`);
    } else if (isRemoved && side === "left") {
      highlightedWords.push(`<span class="git-inline-removed">${escapeHtml(word)}</span>`);
    } else {
      highlightedWords.push(escapeHtml(word));
    }
  });

  element.innerHTML = highlightedWords.join('');
};

const applyImageDiffOutlines = (leftHtml, rightHtml) => {
  const leftDiv = htmlToDiv(leftHtml);
  const rightDiv = htmlToDiv(rightHtml);

  const leftImgs = Array.from(leftDiv.querySelectorAll("img"));
  const rightImgs = Array.from(rightDiv.querySelectorAll("img"));

  let additions = 0,
    deletions = 0;

  const max = Math.max(leftImgs.length, rightImgs.length);
  for (let i = 0; i < max; i++) {
    const li = leftImgs[i];
    const ri = rightImgs[i];
    if (li && !ri) {
      li.classList.add("structural-removed");
      deletions++;
    } else if (!li && ri) {
      ri.classList.add("structural-added");
      additions++;
    } else if (li && ri) {
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
    structSummary: { additions, deletions },
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

        if (xc && ownText && otherText && !areWordsEquivalent(ownText, otherText)) {
          oc.classList.add("git-cell-modified");
          applyWordLevelCellDiff(oc, ownText, otherText, side);
        }
      }
    }
  }

  return ownDiv.innerHTML;
};

const applyWordLevelCellDiff = (cell, ownText, otherText, side) => {
  const diffs = diffWordsWithSpace(ownText || "", otherText || "");
  
  cell.innerHTML = "";
  
  diffs.forEach((diff) => {
    const span = document.createElement("span");
    
    if (diff.added && side === "right") {
      span.className = "git-inline-added";
      span.textContent = diff.value;
    } else if (diff.removed && side === "left") {
      span.className = "git-inline-removed";
      span.textContent = diff.value;
    } else if (!diff.added && !diff.removed) {
      span.textContent = diff.value;
    } else {
      return;
    }
    
    cell.appendChild(span);
  });
};

const isInsideTable = (node) => {
  let p = node.parentNode;
  while (p) {
    if (p.nodeType === 1) {
      const tag = p.tagName && p.tagName.toLowerCase();
      if (
        tag === "table" ||
        tag === "thead" ||
        tag === "tbody" ||
        tag === "tr" ||
        tag === "td" ||
        tag === "th"
      ) {
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
          return `<span class=\"diff-insert\">${escapeHtml(
            diff.content
          )}</span>`;
        case "delete":
          return `<span class=\"diff-delete\">${escapeHtml(
            diff.content
          )}</span>`;
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
const BLOCK_SELECTOR = Array.from(BLOCK_TAGS).join(",");

const extractLineFeatures = (element) => {
  // Gather formatting flags inside the block
  const hasBold = !!element.querySelector("b,strong");
  const hasItalic = !!element.querySelector("i,em");
  const hasUnderline = !!element.querySelector("u");
  const inlineFont =
    element.style && element.style.fontSize ? element.style.fontSize : "";
  let fontSize = inlineFont || "";
  let textAlign =
    element.style && element.style.textAlign ? element.style.textAlign : "";
  // fallback to attribute or class hints
  if (!textAlign) {
    const alignAttr = element.getAttribute && element.getAttribute("align");
    if (alignAttr) textAlign = alignAttr;
  }
  return { hasBold, hasItalic, hasUnderline, fontSize, textAlign };
};

const collectBlockLinesWithFormat = (root) => {
  const blocks = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
  return blocks
    .filter((b) => !isInsideTable(b))
    .map((el, idx) => {
      const text = el.textContent || "";
      const fmt = extractLineFeatures(el);
      return { index: idx, text, fmt, element: el };
    });
};

const visibleSpaces = (s) => {
  if (!s) return "";
  return s
    .replace(/ /g, '<span class="ws">·</span>')
    .replace(/\t/g, '<span class="ws">→</span>');
};

const inlineDiffHtml = (a, b) => {
  const parts = diffWordsWithSpace(a || "", b || "");
  return parts
    .map((p) => {
      const val = visibleSpaces(escapeHtml(p.value || ""));
      if (p.added) return `<span class="git-inline-added">${val}</span>`;
      if (p.removed) return `<span class="git-inline-removed">${val}</span>`;
      return val;
    })
    .join("");
};

const compareFormat = (fa, fb) => {
  const changes = [];
  if (!!fa.hasBold !== !!fb.hasBold)
    changes.push(
      `bold: ${fa.hasBold ? "on" : "off"} → ${fb.hasBold ? "on" : "off"}`
    );
  if (!!fa.hasItalic !== !!fb.hasItalic)
    changes.push(
      `italic: ${fa.hasItalic ? "on" : "off"} → ${fb.hasItalic ? "on" : "off"}`
    );
  if (!!fa.hasUnderline !== !!fb.hasUnderline)
    changes.push(
      `underline: ${fa.hasUnderline ? "on" : "off"} → ${
        fb.hasUnderline ? "on" : "off"
      }`
    );
  if ((fa.fontSize || "") !== (fb.fontSize || ""))
    changes.push(
      `font-size: ${fa.fontSize || "auto"} → ${fb.fontSize || "auto"}`
    );
  if ((fa.textAlign || "") !== (fb.textAlign || ""))
    changes.push(
      `alignment: ${fa.textAlign || "auto"} → ${fb.textAlign || "auto"}`
    );
  return changes;
};

export const generateDetailedReport = (leftHtml, rightHtml) => {
  const L = htmlToDiv(leftHtml);
  const R = htmlToDiv(rightHtml);

  const leftLines = collectBlockLinesWithFormat(L);
  const rightLines = collectBlockLinesWithFormat(R);

  const leftTexts = leftLines.map((l) => l.text || "");
  const rightTexts = rightLines.map((l) => l.text || "");
  const parts = diffArrays(leftTexts, rightTexts, {
    comparator: (a, b) => areWordsEquivalent(a, b),
  });

  const lines = [];
  let iL = 0,
    iR = 0,
    v1 = 1,
    v2 = 1;

  for (const part of parts) {
    const count = part.count || (part.value ? part.value.length : 0);
    if (part.added) {
      for (let k = 0; k < count; k++) {
        const r = rightLines[iR++];
        if (r && r.text.trim()) {
          lines.push({
            v1: "",
            v2: String(v2++),
            status: "ADDED",
            diffHtml: inlineDiffHtml("", r.text),
            formatChanges: [`added line`],
          });
        }
      }
      continue;
    }
    if (part.removed) {
      for (let k = 0; k < count; k++) {
        const l = leftLines[iL++];
        if (l && l.text.trim()) {
          lines.push({
            v1: String(v1++),
            v2: "",
            status: "REMOVED",
            diffHtml: inlineDiffHtml(l.text, ""),
            formatChanges: [`removed line`],
          });
        }
      }
      continue;
    }
    // unchanged block - may still be formatting-only differences when synced positions differ in formatting
    for (let k = 0; k < count; k++) {
      const l = leftLines[iL++];
      const r = rightLines[iR++];
      if (!l || !r) continue;

      const textEqual = areWordsEquivalent(l.text || "", r.text || "");
      const fmtChanges = compareFormat(l.fmt, r.fmt);

      if (textEqual && fmtChanges.length > 0) {
        lines.push({
          v1: String(v1++),
          v2: String(v2++),
          status: "FORMATTING-ONLY",
          diffHtml: visibleSpaces(escapeHtml(l.text || "")),
          formatChanges: fmtChanges,
        });
      } else if (textEqual) {
        lines.push({
          v1: String(v1++),
          v2: String(v2++),
          status: "UNCHANGED",
          diffHtml: visibleSpaces(escapeHtml(l.text || "")),
          formatChanges: [],
        });
      } else if (l.text.trim() || r.text.trim()) {
        lines.push({
          v1: String(v1++),
          v2: String(v2++),
          status: "MODIFIED",
          diffHtml: inlineDiffHtml(l.text, r.text),
          formatChanges: fmtChanges,
        });
      }
    }
  }

  // Tables report
  const tableReport = [];
  const Lt = Array.from(L.querySelectorAll("table"));
  const Rt = Array.from(R.querySelectorAll("table"));
  const tcount = Math.max(Lt.length, Rt.length);
  for (let ti = 0; ti < tcount; ti++) {
    const TL = Lt[ti],
      TR = Rt[ti];
    if (!TL && TR) {
      tableReport.push({ table: ti + 1, status: "ADDED" });
      continue;
    }
    if (TL && !TR) {
      tableReport.push({ table: ti + 1, status: "REMOVED" });
      continue;
    }
    if (!(TL && TR)) continue;
    const rL = Array.from(TL.rows || []);
    const rR = Array.from(TR.rows || []);
    const rcount = Math.max(rL.length, rR.length);
    for (let ri = 0; ri < rcount; ri++) {
      const rowL = rL[ri],
        rowR = rR[ri];
      if (!rowL && rowR) {
        tableReport.push({ table: ti + 1, row: ri + 1, status: "ADDED" });
        continue;
      }
      if (rowL && !rowR) {
        tableReport.push({ table: ti + 1, row: ri + 1, status: "REMOVED" });
        continue;
      }
      const cL = Array.from(rowL.cells || []);
      const cR = Array.from(rowR.cells || []);
      const ccount = Math.max(cL.length, cR.length);
      for (let ci = 0; ci < ccount; ci++) {
        const cellL = cL[ci],
          cellR = cR[ci];
        if (!cellL && cellR) {
          tableReport.push({
            table: ti + 1,
            row: ri + 1,
            col: ci + 1,
            status: "ADDED",
          });
          continue;
        }
        if (cellL && !cellR) {
          tableReport.push({
            table: ti + 1,
            row: ri + 1,
            col: ci + 1,
            status: "REMOVED",
          });
          continue;
        }
        const a = (cellL.textContent || "").trim();
        const b = (cellR.textContent || "").trim();
        if (a && b && !areWordsEquivalent(a, b)) {
          tableReport.push({
            table: ti + 1,
            row: ri + 1,
            col: ci + 1,
            status: "MODIFIED",
            diffHtml: inlineDiffHtml(a, b),
          });
        }
      }
    }
  }

  // Images report
  const Li = Array.from(L.querySelectorAll("img")).map(
    (i) => i.getAttribute("src") || ""
  );
  const Ri = Array.from(R.querySelectorAll("img")).map(
    (i) => i.getAttribute("src") || ""
  );
  const imgReport = [];
  const imax = Math.max(Li.length, Ri.length);
  for (let i = 0; i < imax; i++) {
    const a = Li[i],
      b = Ri[i];
    if (a && !b) imgReport.push({ index: i + 1, status: "REMOVED", src: a });
    else if (!a && b) imgReport.push({ index: i + 1, status: "ADDED", src: b });
    else if (a && b && a !== b)
      imgReport.push({ index: i + 1, status: "REPLACED", from: a, to: b });
  }

  return { lines, tables: tableReport, images: imgReport };
};