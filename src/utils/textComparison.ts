import { diffWords } from "diff";
import { DiffResult, ComparisonResult } from "../types";

export const compareDocuments = (
  leftText: string,
  rightText: string
): ComparisonResult => {
  // Use word-based diff for more granular comparison
  const diffs = diffWords(leftText, rightText);

  const leftDiffs: DiffResult[] = [];
  const rightDiffs: DiffResult[] = [];
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

export const highlightDifferences = (diffs: DiffResult[]): string => {
  return diffs
    .map((diff) => {
      switch (diff.type) {
        case "insert":
          return `<span class="diff-insert">${escapeHtml(diff.content)}</span>`;
        case "delete":
          return `<span class="diff-delete">${escapeHtml(diff.content)}</span>`;
        default:
          return escapeHtml(diff.content);
      }
    })
    .join("");
};

const escapeHtml = (text: string): string => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

export const compareHtmlDocuments = (
  leftHtml: string,
  rightHtml: string
): ComparisonResult => {
  // First, detect structural differences (images, tables, etc.)
  const leftStructure = extractStructuralElements(leftHtml);
  const rightStructure = extractStructuralElements(rightHtml);

  // Console report: images removed or not
  try {
    const removedImages = leftStructure.images.filter(
      (img: any) => !rightStructure.images.some((r: any) => r.src === img.src)
    );
    if (removedImages.length > 0) {
      // Log count and basic identifiers to avoid noisy full HTML
      console.log(
        "[Comparison] Images removed:",
        removedImages.length,
        removedImages.map((i: any) => ({ index: i.index, src: i.src }))
      );
    } else {
      console.log("[Comparison] No images removed");
    }
  } catch (e) {
    // Non-fatal logging error safeguard
    console.warn("[Comparison] Could not compute removed images:", e);
  }

  // Apply structural highlighting to both documents
  const leftWithStructuralHighlights = applyStructuralHighlighting(
    leftHtml,
    leftStructure,
    rightStructure,
    "left"
  );
  const rightWithStructuralHighlights = applyStructuralHighlighting(
    rightHtml,
    rightStructure,
    leftStructure,
    "right"
  );

  // Extract plain text from HTML for text comparison
  const leftText = extractTextFromHtml(leftHtml);
  const rightText = extractTextFromHtml(rightHtml);

  // Perform word-level comparison on plain text
  const textDiffs = diffWords(leftText, rightText);

  // Apply text highlighting to documents that already have structural highlights
  const leftFinal = applyTextDifferencesToHtml(
    leftWithStructuralHighlights,
    textDiffs,
    "left"
  );
  const rightFinal = applyTextDifferencesToHtml(
    rightWithStructuralHighlights,
    textDiffs,
    "right"
  );

  // Calculate summary including structural changes
  let summary = { additions: 0, deletions: 0, changes: 0 };

  // Count text changes
  textDiffs.forEach((diff) => {
    if (diff.added) summary.additions++;
    if (diff.removed) summary.deletions++;
  });

  // Count structural changes
  const structuralChanges = countStructuralChanges(
    leftStructure,
    rightStructure
  );
  summary.additions += structuralChanges.additions;
  summary.deletions += structuralChanges.deletions;
  summary.changes = summary.additions + summary.deletions;

  // Return as DiffResult arrays for consistency
  const leftDiffs: DiffResult[] = [{ type: "equal", content: leftFinal }];
  const rightDiffs: DiffResult[] = [{ type: "equal", content: rightFinal }];

  return { leftDiffs, rightDiffs, summary };
};

// Extract structural elements like images, tables, etc.
const extractStructuralElements = (html: string) => {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const images = Array.from(tempDiv.querySelectorAll("img")).map(
    (img, index) => ({
      type: "image",
      index,
      src: img.src,
      alt: img.alt || "",
      element: img.outerHTML,
      id: `img-${index}-${img.src.substring(0, 20)}`,
    })
  );

  const tables = Array.from(tempDiv.querySelectorAll("table")).map(
    (table, index) => ({
      type: "table",
      index,
      element: table.outerHTML,
      id: `table-${index}-${table.textContent?.substring(0, 20) || ""}`,
    })
  );

  return { images, tables };
};

// Apply highlighting for structural changes (images, tables)
const applyStructuralHighlighting = (
  html: string,
  ownStructure: any,
  otherStructure: any,
  side: "left" | "right"
) => {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  const imageNodes = Array.from(tempDiv.querySelectorAll("img"));
  const tableNodes = Array.from(tempDiv.querySelectorAll("table"));

  const wrapWithBlock = (
    node: Element,
    blockClass: string,
    labelClass: string,
    labelText: string
  ) => {
    const wrapper = document.createElement("div");
    wrapper.className = blockClass;
    const label = document.createElement("div");
    label.className = labelClass;
    label.textContent = labelText;
    const parent = node.parentNode;
    if (!parent) return;
    parent.replaceChild(wrapper, node);
    wrapper.appendChild(label);
    wrapper.appendChild(node);
  };

  // Detect modified images at the same positions
  const modifiedImageIndices = new Set<number>();
  const minImageCount = Math.min(
    ownStructure.images.length,
    otherStructure.images.length
  );
  for (let i = 0; i < minImageCount; i++) {
    const ownImg = ownStructure.images[i];
    const otherImg = otherStructure.images[i];
    if (ownImg.element !== otherImg.element) {
      const imgNode = imageNodes[i];
      if (imgNode) {
        wrapWithBlock(
          imgNode,
          "diff-modify-block",
          "modified-element-label",
          "🖼️ Image Modified"
        );
        modifiedImageIndices.add(i);
      }
    }
  }

  // Handle image additions/deletions (skip ones already marked as modified)
  if (side === "left") {
    // Mark images that were removed (exist in left but not in right)
    ownStructure.images.forEach((img: any) => {
      if (modifiedImageIndices.has(img.index)) return;
      const existsInRight = otherStructure.images.some(
        (rightImg: any) => rightImg.src === img.src
      );
      if (!existsInRight) {
        const imgNode = imageNodes[img.index];
        if (imgNode) {
          wrapWithBlock(
            imgNode,
            "diff-delete-block",
            "removed-element-label",
            "🖼️ Image Removed"
          );
        }
      }
    });
  } else {
    // Mark images that were added (exist in right but not in left)
    ownStructure.images.forEach((img: any) => {
      if (modifiedImageIndices.has(img.index)) return;
      const existsInLeft = otherStructure.images.some(
        (leftImg: any) => leftImg.src === img.src
      );
      if (!existsInLeft) {
        const imgNode = imageNodes[img.index];
        if (imgNode) {
          wrapWithBlock(
            imgNode,
            "diff-insert-block",
            "added-element-label",
            "🖼️ Image Added"
          );
        }
      }
    });
  }

  // Handle table differences by count only: allow text inside tables to be diffed
  const ownTableCount = ownStructure.tables.length;
  const otherTableCount = otherStructure.tables.length;
  if (side === "left") {
    if (ownTableCount > otherTableCount) {
      for (
        let i = otherTableCount;
        i < Math.min(ownTableCount, tableNodes.length);
        i++
      ) {
        const tableNode = tableNodes[i];
        if (tableNode) {
          wrapWithBlock(
            tableNode,
            "diff-delete-block",
            "removed-element-label",
            "📊 Table Removed"
          );
        }
      }
    }
  } else {
    if (ownTableCount > otherTableCount) {
      for (
        let i = otherTableCount;
        i < Math.min(ownTableCount, tableNodes.length);
        i++
      ) {
        const tableNode = tableNodes[i];
        if (tableNode) {
          wrapWithBlock(
            tableNode,
            "diff-insert-block",
            "added-element-label",
            "📊 Table Added"
          );
        }
      }
    }
  }

  return tempDiv.innerHTML;
};

// Count structural changes for summary
const countStructuralChanges = (leftStructure: any, rightStructure: any) => {
  let additions = 0;
  let deletions = 0;

  // Count image changes
  leftStructure.images.forEach((img: any) => {
    const existsInRight = rightStructure.images.some(
      (rightImg: any) => rightImg.src === img.src
    );
    if (!existsInRight) deletions++;
  });

  rightStructure.images.forEach((img: any) => {
    const existsInLeft = leftStructure.images.some(
      (leftImg: any) => leftImg.src === img.src
    );
    if (!existsInLeft) additions++;
  });

  // Count image modifications by index
  const minImageCount = Math.min(
    leftStructure.images.length,
    rightStructure.images.length
  );
  for (let i = 0; i < minImageCount; i++) {
    const leftImg = leftStructure.images[i];
    const rightImg = rightStructure.images[i];
    if (leftImg.element !== rightImg.element) {
      // Treat a modification as both an addition and a deletion for summary purposes
      additions++;
      deletions++;
    }
  }

  // Count table changes by difference in counts only
  const leftTableCount = leftStructure.tables.length;
  const rightTableCount = rightStructure.tables.length;
  if (leftTableCount > rightTableCount) {
    deletions += leftTableCount - rightTableCount;
  } else if (rightTableCount > leftTableCount) {
    additions += rightTableCount - leftTableCount;
  }

  return { additions, deletions };
};

// Extract plain text from HTML while preserving word boundaries
const extractTextFromHtml = (html: string): string => {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // Remove images from text extraction to avoid interference, but keep tables so their text is diffed
  tempDiv.querySelectorAll("img").forEach((el) => el.remove());

  // Get text content and normalize whitespace but preserve structure
  const text = tempDiv.textContent || "";
  return text.replace(/\s+/g, " ").trim();
};

// Apply text differences to HTML while preserving ALL original formatting
const applyTextDifferencesToHtml = (
  originalHtml: string,
  diffs: any[],
  side: "left" | "right"
): string => {
  // If no text changes for this side, return original HTML unchanged
  const hasTextChanges = diffs.some(
    (diff) =>
      (side === "left" && diff.removed) || (side === "right" && diff.added)
  );

  if (!hasTextChanges) {
    return originalHtml;
  }

  // Create a temporary container to work with the HTML
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = originalHtml;

  // Get all text nodes in the document (excluding those in images)
  const textNodes = getAllTextNodes(tempDiv);

  // Build the diff text for this side
  let diffSegments: Array<{
    text: string;
    type: "normal" | "added" | "removed";
  }> = [];

  diffs.forEach((diff) => {
    if (side === "left") {
      if (diff.removed) {
        diffSegments.push({ text: diff.value, type: "removed" });
      } else if (!diff.added) {
        diffSegments.push({ text: diff.value, type: "normal" });
      }
    } else {
      if (diff.added) {
        diffSegments.push({ text: diff.value, type: "added" });
      } else if (!diff.removed) {
        diffSegments.push({ text: diff.value, type: "normal" });
      }
    }
  });

  // Apply highlighting to text nodes while preserving HTML structure
  let segmentIndex = 0;
  let segmentOffset = 0;

  textNodes.forEach((textNode) => {
    const nodeText = textNode.textContent || "";
    let newContent = "";
    let nodeOffset = 0;

    while (nodeOffset < nodeText.length && segmentIndex < diffSegments.length) {
      const segment = diffSegments[segmentIndex];
      const remainingSegmentText = segment.text.substring(segmentOffset);
      const remainingNodeText = nodeText.substring(nodeOffset);

      // Find how much of this segment fits in this text node
      const matchLength = Math.min(
        remainingSegmentText.length,
        remainingNodeText.length
      );
      const textToProcess = nodeText.substring(
        nodeOffset,
        nodeOffset + matchLength
      );

      // Apply highlighting based on segment type
      if (segment.type === "added") {
        newContent += `<span class="diff-insert">${escapeHtml(
          textToProcess
        )}</span>`;
      } else if (segment.type === "removed") {
        newContent += `<span class="diff-delete">${escapeHtml(
          textToProcess
        )}</span>`;
      } else {
        newContent += escapeHtml(textToProcess);
      }

      nodeOffset += matchLength;
      segmentOffset += matchLength;

      // Move to next segment if current one is complete
      if (segmentOffset >= segment.text.length) {
        segmentIndex++;
        segmentOffset = 0;
      }
    }

    // Handle any remaining text in the node
    if (nodeOffset < nodeText.length) {
      newContent += escapeHtml(nodeText.substring(nodeOffset));
    }

    // Replace the text node with highlighted content
    if (newContent !== escapeHtml(nodeText)) {
      const wrapper = document.createElement("span");
      wrapper.innerHTML = newContent;
      textNode.parentNode?.replaceChild(wrapper, textNode);
    }
  });

  return tempDiv.innerHTML;
};

// Get all text nodes from an element recursively (excluding images)
const getAllTextNodes = (element: Element): Text[] => {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip text nodes inside images or diff blocks
        const parent = node.parentElement;
        if (
          parent?.closest(
            "img, .diff-insert-block, .diff-delete-block, .diff-modify-block"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        // Only include text nodes with actual content
        return node.textContent?.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    },
    false
  );

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  return textNodes;
};

// Render diffs where content is already HTML with word-level highlighting
export const renderHtmlDifferences = (diffs: DiffResult[]): string => {
  return diffs
    .map((diff) => {
      // For HTML content, just return as-is since highlighting is already applied
      return diff.content;
    })
    .join("");
};
