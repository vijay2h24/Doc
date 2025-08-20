import { useState, useCallback } from "react";
import { DocumentData, ComparisonResult } from "../types";
import { compareHtmlDocuments } from "../utils/textComparison";

export const useDocumentComparison = () => {
  const [leftDocument, setLeftDocument] = useState<DocumentData | null>(null);
  const [rightDocument, setRightDocument] = useState<DocumentData | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const handleDocumentUpload = useCallback(
    (document: DocumentData, position: "left" | "right") => {
      if (position === "left") {
        setLeftDocument(document);
      } else {
        setRightDocument(document);
      }
      // Reset comparison when new document is uploaded
      setComparison(null);
    },
    []
  );

  const compareDocuments = useCallback(async () => {
    if (!leftDocument || !rightDocument) return;

    setIsComparing(true);
    try {
      // Add a small delay to show loading state
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = compareHtmlDocuments(
        leftDocument.htmlContent,
        rightDocument.htmlContent
      );
      setComparison(result);
    } catch (error) {
      console.error("Error comparing documents:", error);
      throw error;
    } finally {
      setIsComparing(false);
    }
  }, [leftDocument, rightDocument]);

  const clearDocuments = useCallback(() => {
    setLeftDocument(null);
    setRightDocument(null);
    setComparison(null);
  }, []);

  const clearComparison = useCallback(() => {
    setComparison(null);
  }, []);

  return {
    leftDocument,
    rightDocument,
    comparison,
    isComparing,
    handleDocumentUpload,
    compareDocuments,
    clearDocuments,
    clearComparison,
    canCompare: !!(leftDocument && rightDocument),
  };
};
