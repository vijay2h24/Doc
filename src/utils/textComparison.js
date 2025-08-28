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
  const leftText = extractPlainText(leftHtml);
  const rightText = extractPlainText(rightHtml);
  const textDiffs = diffChars(leftText, rightText);

  const { leftDomWithImages, rightDomWithImages, structSummary } = applyImageDiffOutlines(leftHtml, rightHtml);
  const leftWithTable = applyTableCellDiffs(leftDomWithImages, rightDomWithImages, "left");
  const rightWithTable = applyTableCellDiffs(rightDomWithImages, leftDomWithImages, "right");

  let summary = { additions: 0, deletions: 0, changes: 0 };
  textDiffs.forEach((d) => {
    if (d.added) summary.additions++;
    if (d.removed) summary.deletions++;
  });
  summary.additions += structSummary.additions;
  summary.deletions += structSummary.deletions;
  summary.changes = summary.additions + summary.deletions;

  const leftFinal = applyGitLikeLineComparison(leftWithTable, rightWithTable, "left");
  const rightFinal = applyGitLikeLineComparison(rightWithTable, leftWithTable, "right");

  const detailed = generateDetailedReport(leftHtml, rightHtml);

  const leftDiffs = [{ type: "equal", content: leftFinal }];
  const rightDiffs = [{ type: "equal", content: rightFinal }];

  return { leftDiffs, rightDiffs, summary, detailed };
};

const BLOCK_TAGS = new Set(["p","h1","h2","h3","h4","h5","h6","li","pre","div"]);

const collectLines = (root) => {
  const lines = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let node;
  while ((node = walker.nextNode())) {
    const tag = node.tagName ? node.tagName.toLowerCase() : "";
    if (BLOCK_TAGS.has(tag) && !isInsideTable(node) && !isInsideTable(node.parentNode)) {
      const text = node.textContent || "";
      lines.push({ element: node, text, originalText: text, isEmpty: text.trim().length === 0, tagName: tag });
    }
  }
  return lines;
};

const applyGitLikeLineComparison = (ownHtml, otherHtml, side) => {
  const ownDiv = htmlToDiv(ownHtml);
  const otherDiv = htmlToDiv(otherHtml);

  const ownLines = collectLines(ownDiv);
  const otherLines = collectLines(otherDiv);

  const diffResult = createIndexAlignedDiff(ownLines, otherLines);

  applyGitLikeDiffToDOM(ownDiv, diffResult, side);
  return ownDiv.innerHTML;
};

// Build a robust line mapping using LCS via diffArrays so insertions/deletions align properly
const createIndexAlignedDiff = (ownLines, otherLines) => {
  const ownTexts = ownLines.map(l => l.text || "");
  const otherTexts = otherLines.map(l => l.text || "");
  const parts = diffArrays(ownTexts, otherTexts, { comparator: (a, b) => a === b });

  const result = [];
  let iOwn = 0;
  let iOther = 0;

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    if (part.added) {
      // Lines present only in other
      for (let k = 0; k < part.value.length; k++) {
        const otherLine = otherLines[iOther + k] || null;
        result.push({ type: 'onlyOther', lineNumber: iOwn + k, content: otherLine ? (otherLine.text || '') : '', element: null, isEmpty: otherLine ? otherLine.isEmpty : true, otherContent: otherLine ? (otherLine.text || '') : '', otherElement: otherLine ? otherLine.element : null });
      }
      iOther += part.count || part.value.length;
      continue;
    }
    if (part.removed) {
      // Look-ahead: if the next part is an added block of similar size, treat as modified pairs
      const next = parts[p + 1];
      if (next && next.added) {
        const removedCount = part.count || part.value.length;
        const addedCount = next.count || next.value.length;
        const pairCount = Math.min(removedCount, addedCount);
        for (let k = 0; k < pairCount; k++) {
          const ownLine = ownLines[iOwn + k] || null;
          const otherLine = otherLines[iOther + k] || null;
          if (ownLine && otherLine) {
            result.push({ type: 'modified', lineNumber: iOwn + k, content: ownLine.text || '', otherContent: otherLine.text || '', element: ownLine.element, isEmpty: ownLine.isEmpty, otherElement: otherLine.element });
          }
        }
        // Remaining removed-only
        for (let k = pairCount; k < removedCount; k++) {
          const ownLine = ownLines[iOwn + k] || null;
          if (ownLine) {
            result.push({ type: 'onlyOwn', lineNumber: iOwn + k, content: ownLine.text || '', element: ownLine.element, isEmpty: ownLine.isEmpty, otherElement: null });
          }
        }
        // Remaining added-only will be handled when we advance to the next loop iteration for the added part
        iOwn += removedCount;
        // Do not consume iOther yet; it will be advanced by the added branch above when loop continues to next part
        // Skip processing of the next added part here; it will be processed normally
        continue;
      }
      // Pure removals
      for (let k = 0; k < (part.count || part.value.length); k++) {
        const ownLine = ownLines[iOwn + k] || null;
        if (ownLine) {
          result.push({ type: 'onlyOwn', lineNumber: iOwn + k, content: ownLine.text || '', element: ownLine.element, isEmpty: ownLine.isEmpty, otherElement: null });
        }
      }
      iOwn += part.count || part.value.length;
      continue;
    }
    // Equal block
    for (let k = 0; k < (part.count || part.value.length); k++) {
      const ownLine = ownLines[iOwn + k];
      result.push({ type: 'unchanged', lineNumber: iOwn + k, content: ownLine.text || '', element: ownLine.element, isEmpty: ownLine.isEmpty });
    }
    iOwn += part.count || part.value.length;
    iOther += part.count || part.value.length;
  }

  return result;
};

const applyGitLikeDiffToDOM = (container, diffResult, side) => {
  const getBlocks = () => Array.from(container.querySelectorAll(Array.from(BLOCK_TAGS).join(',')));
  const addGutter = (el, marker, lineNumber) => {
    if (!el || el.classList.contains('with-gutter')) return;
    el.classList.add('with-gutter');
    const gutter = document.createElement('span');
    gutter.className = 'git-gutter';
    gutter.setAttribute('data-marker', marker || ' ');
    if (typeof lineNumber === 'number') gutter.setAttribute('data-line', String(lineNumber + 1));
    el.insertBefore(gutter, el.firstChild);
  };

  diffResult.forEach((diffLine) => {
    const type = diffLine.type;

    if (type === 'onlyOwn') {
      const element = diffLine.element;
      if (!element) return;
      if (side === 'left') {
        element.classList.add('git-line-removed');
        addGutter(element, '-', diffLine.lineNumber);
        applyInlineWordDiff(element, element.textContent || '', '', 'left');
      } else if (side === 'right') {
        element.classList.add('git-line-added');
        addGutter(element, '+', diffLine.lineNumber);
        applyInlineWordDiff(element, '', element.textContent || '', 'right');
      }
      return;
    }

    if (type === 'modified') {
      const element = diffLine.element;
      if (!element) return;
      const ownText = element.textContent || '';
      const otherText = diffLine.otherContent || '';
      // Mark the whole line as modified to mimic Git-style diffs
      element.classList.add('git-line-modified');
      addGutter(element, ' ', diffLine.lineNumber);
      applyInlineWordDiff(element, ownText, otherText, side);
      return;
    }

    if (type === 'onlyOther') {
      // Insert a height-matched placeholder at this index to preserve vertical alignment
      const blocks = getBlocks();
      const anchor = blocks[diffLine.lineNumber] || null;
      const placeholder = document.createElement(diffLine.otherElement ? diffLine.otherElement.tagName.toLowerCase() : 'div');
      placeholder.className = 'git-line-placeholder';
      // Add gutter showing +/- depending on which side lacks the line
      const marker = side === 'left' ? '+' : '-';
      const gutter = document.createElement('span');
      gutter.className = 'git-gutter';
      gutter.setAttribute('data-marker', marker);
      gutter.setAttribute('data-line', String((diffLine.lineNumber || 0) + 1));
      placeholder.classList.add('with-gutter');
      placeholder.appendChild(gutter);
      // Measure other element height
      let heightPx = 0;
      if (diffLine.otherElement) {
        heightPx = diffLine.otherElement.offsetHeight || diffLine.otherElement.getBoundingClientRect().height || 0;
      }
      if (heightPx > 0) placeholder.style.height = `${Math.ceil(heightPx)}px`;
      placeholder.setAttribute('data-line', String(diffLine.lineNumber));
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(placeholder, anchor);
      } else {
        container.appendChild(placeholder);
      }
      return;
    }

    if (type === 'unchanged') {
      return;
    }
  });
};

const applyInlineWordDiff = (element, ownText, otherText, side) => {
  const diffs = diffWordsWithSpace(ownText || '', otherText || '');

  // Traverse text nodes and replace text segments with highlighted spans respecting diffs
  const textNodes = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let tn;
  while ((tn = walker.nextNode())) {
    textNodes.push(tn);
  }

  let diffIdx = 0;
  let diffOffset = 0;

  const getNextSegment = (needLen) => {
    if (diffIdx >= diffs.length || needLen <= 0) return null;
    const d = diffs[diffIdx];
    const remaining = (d.value || '').length - diffOffset;
    const take = Math.min(needLen, remaining);
    const segment = { added: !!d.added, removed: !!d.removed, value: (d.value || '').slice(diffOffset, diffOffset + take) };
    diffOffset += take;
    if (diffOffset >= (d.value || '').length) { diffIdx++; diffOffset = 0; }
    return segment;
  };

  const toVisible = (s) => (s || '').replace(/ /g, '\u00B7').replace(/\t/g, '\u2192');

  textNodes.forEach((node) => {
    const text = node.nodeValue || '';
    if (!text.length) return;

    const frag = document.createDocumentFragment();
    let consumed = 0;
    while (consumed < text.length) {
      let seg = getNextSegment(text.length - consumed);
      if (!seg) {
        frag.appendChild(document.createTextNode(text.slice(consumed)));
        consumed = text.length;
        break;
      }
      const segText = text.substr(consumed, seg.value.length);
      const shouldAdd = seg.added && side === 'right';
      const shouldRemove = seg.removed && side === 'left';
      if (shouldAdd) {
        const span = document.createElement('span');
        span.className = 'git-inline-added';
        span.textContent = toVisible(segText);
        frag.appendChild(span);
      } else if (shouldRemove) {
        const span = document.createElement('span');
        span.className = 'git-inline-removed';
        span.textContent = toVisible(segText);
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(toVisible(segText)));
      }
      consumed += seg.value.length;
    }
    node.parentNode.replaceChild(frag, node);
  });
};

const applyInlineDiffHighlighting = (element, ownText, otherText, side) => {
  // Deprecated; use applyInlineWordDiff
  return;
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
    else if (li && ri && (li.getAttribute("src") || "") !== (ri.getAttribute("src") || "")) {
      li.classList.add("structural-modified");
      ri.classList.add("structural-modified");
      additions++; deletions++;
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

        const ownText = (oc.textContent || "");
        const otherText = (xc ? xc.textContent : "");

        if (!xc) {
          if (side === "left") {
            oc.classList.add("git-cell-removed");
            orow.classList.add("git-line-removed");
          }
          continue;
        }
        if (xc && !ownText && otherText && side === "right") {
          oc.classList.add("git-cell-added");
          orow.classList.add("git-line-added");
        }

        if (xc && ownText !== otherText) {
          oc.classList.add("git-cell-modified");
          applyInlineWordDiff(oc, ownText, otherText, side);
        }
      }
    }
  }

  return ownDiv.innerHTML;
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
        lines.push({ v1: '', v2: String(v2++), status: 'ADDED', diffHtml: inlineDiffHtml('', r.text), formatChanges: [`added line`] });
      }
      continue;
    }
    if (part.removed) {
      for (let k = 0; k < count; k++) {
        const l = leftLines[iL++];
        lines.push({ v1: String(v1++), v2: '', status: 'REMOVED', diffHtml: inlineDiffHtml(l.text, ''), formatChanges: [`removed line`] });
      }
      continue;
    }
    // unchanged block - may still be formatting-only differences when synced positions differ in formatting
    for (let k = 0; k < count; k++) {
      const l = leftLines[iL++];
      const r = rightLines[iR++];
      const textEqual = (l.text || '') === (r.text || '');
      const fmtChanges = compareFormat(l.fmt, r.fmt);
      if (textEqual && fmtChanges.length > 0) {
        lines.push({ v1: String(v1++), v2: String(v2++), status: 'FORMATTING-ONLY', diffHtml: visibleSpaces(escapeHtml(l.text || '')), formatChanges: fmtChanges });
      } else if (textEqual) {
        lines.push({ v1: String(v1++), v2: String(v2++), status: 'UNCHANGED', diffHtml: visibleSpaces(escapeHtml(l.text || '')), formatChanges: [] });
      } else {
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
        const a = cellL.textContent || '';
        const b = cellR.textContent || '';
        if (a !== b) {
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