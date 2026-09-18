export type FileEntry = {
  path: string;
  name: string;
  size: number;
  extension: string;
  modifiedSecs: number | null;
  ageDays: number | null;
};

export type ExtensionSummary = {
  extension: string;
  size: number;
  count: number;
};

export type DirectorySummary = {
  name: string;
  path: string;
  size: number;
  fileCount: number;
};

export type DuplicateCandidate = {
  size: number;
  count: number;
  potentialSavings: number;
  files: FileEntry[];
};

export type Recommendation = {
  path: string;
  name: string;
  size: number;
  ageDays: number | null;
  category: string;
  reason: string;
  risk: "Baixo" | "Revisar";
  confidence: number;
};

export type ScanProgress = {
  root: string;
  filesScanned: number;
  foldersScanned: number;
  skippedEntries: number;
  bytesScanned: number;
  elapsedMs: number;
  currentPath: string;
};

export type ScanReport = {
  root: string;
  totalSize: number;
  fileCount: number;
  folderCount: number;
  skippedEntries: number;
  durationMs: number;
  largestFiles: FileEntry[];
  extensions: ExtensionSummary[];
  directories: DirectorySummary[];
  duplicateCandidates: DuplicateCandidate[];
  recommendations: Recommendation[];
};
