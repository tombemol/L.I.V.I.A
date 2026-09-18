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

export type DuplicateProgress = {
  phase: "partial" | "full" | "done";
  candidateFiles: number;
  partialHashedFiles: number;
  fullyHashedFiles: number;
  skippedFiles: number;
  currentPath: string;
  elapsedMs: number;
};

export type DuplicateGroup = {
  size: number;
  count: number;
  reclaimableBytes: number;
  hash: string;
  files: FileEntry[];
};

export type DuplicateReport = {
  groups: DuplicateGroup[];
  candidateFiles: number;
  partialHashedFiles: number;
  fullyHashedFiles: number;
  skippedFiles: number;
  reclaimableBytes: number;
  durationMs: number;
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

export type ScanEngine = {
  mode: string;
  label: string;
  accelerated: boolean;
  fallbackReason: string | null;
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
  indexRoot: string;
  totalSize: number;
  fileCount: number;
  folderCount: number;
  skippedEntries: number;
  durationMs: number;
  indexedFiles: number;
  engine: ScanEngine;
  largestFiles: FileEntry[];
  extensions: ExtensionSummary[];
  directories: DirectorySummary[];
  duplicateCandidates: DuplicateCandidate[];
  recommendations: Recommendation[];
};

export type SearchResponse = {
  total: number;
  durationMs: number;
  files: FileEntry[];
};


export type CleanupFailure = {
  path: string;
  reason: string;
};

export type CleanupResult = {
  movedFiles: FileEntry[];
  movedBytes: number;
  failed: CleanupFailure[];
  operationId: string | null;
  undoableFiles: number;
};

export type CleanupRestoreResult = {
  restoredFiles: FileEntry[];
  restoredBytes: number;
  failed: CleanupFailure[];
  remainingUndoableFiles: number;
};

export type CleanupHistoryEntry = {
  id: string;
  timestamp: number;
  movedFiles: number;
  movedBytes: number;
  failedFiles: number;
  operationId?: string;
  undoableFiles?: number;
  restoredFiles?: number;
  restoredBytes?: number;
  restoreFailedFiles?: number;
};


export type SnapshotBucket = {
  label: string;
  path: string | null;
  size: number;
  count: number;
};

export type StorageSnapshot = {
  id: string;
  createdAtSecs: number;
  root: string;
  totalSize: number;
  fileCount: number;
  folderCount: number;
  indexedFiles: number;
  engineLabel: string;
  directories: SnapshotBucket[];
  extensions: SnapshotBucket[];
};

export type CachedIndexResponse = {
  report: ScanReport;
  savedAtSecs: number;
  snapshots: StorageSnapshot[];
};


export type RefreshIndexResponse = {
  report: ScanReport;
  incremental: boolean;
  changedEntries: number;
  updatedFiles: number;
  removedFiles: number;
  fallbackReason: string | null;
};
