export interface DocumentData {
  id: string;
  name: string;
  content: string;
  htmlContent: string;
  originalHtmlContent: string;
  file: File;
}

export interface DiffResult {
  type: "equal" | "insert" | "delete";
  content: string;
}

export interface ComparisonResult {
  leftDiffs: DiffResult[];
  rightDiffs: DiffResult[];
  summary: {
    additions: number;
    deletions: number;
    changes: number;
  };
}
