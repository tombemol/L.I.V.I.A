import { useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  HardDrive,
  Files,
  FolderTree,
  ShieldCheck,
  Search,
  X,
  Smartphone,
  Database
} from "lucide-react";
import { LiviaAssistant } from "../components/LiviaAssistant";
import { formatBytes } from "../lib/format";
import type { DirectorySummary, ExtensionSummary, FileEntry, ScanProgress, ScanReport } from "../types";

type MobileResult = {
  report: ScanReport;
  folderName: string;
};

type QueueItem = {
  uri: string;
  name: string;
  topLevel: string | null;
};

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1
    ? name.slice(dot).toLocaleLowerCase("pt-BR")
    : "sem extensão";
}

function readUri(entry: any): string | null {
  if (typeof entry === "string") return entry;
  return entry?.uri ?? entry?.entry?.uri ?? entry?.file?.uri ?? entry?.dir?.uri ?? null;
}

function readName(entry: any): string | null {
  return entry?.name ?? entry?.entry?.name ?? entry?.file?.name ?? entry?.dir?.name ?? null;
}

function readType(entry: any): string {
  const value = entry?.type ?? entry?.entryType ?? entry?.kind ?? entry?.entry?.type;
  return String(value ?? "").toLocaleLowerCase("en-US");
}

function readKnownSize(entry: any): number | null {
  const value =
    entry?.len ??
    entry?.size ??
    entry?.byteLength ??
    entry?.file?.len ??
    entry?.file?.size ??
    entry?.entry?.len;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isDirectoryType(value: string) {
  return value.includes("dir") || value.includes("folder");
}

async function scanSafTree(
  rootUri: string,
  folderName: string,
  onProgress: (progress: ScanProgress) => void,
  cancelled: () => boolean
): Promise<MobileResult> {
  const AndroidFs: any = await import("tauri-plugin-android-fs-api");
  const started = performance.now();
  const queue: QueueItem[] = [{ uri: rootUri, name: folderName, topLevel: null }];
  const files: FileEntry[] = [];
  const directorySizes = new Map<string, { uri: string; size: number; count: number }>();
  let folders = 0;
  let skipped = 0;
  let bytes = 0;

  while (queue.length) {
    if (cancelled()) throw new Error("Análise cancelada.");

    const current = queue.shift()!;
    let entries: any[];

    try {
      entries = await AndroidFs.readDir(current.uri);
    } catch {
      skipped += 1;
      continue;
    }

    for (const raw of entries ?? []) {
      if (cancelled()) throw new Error("Análise cancelada.");

      const uri = readUri(raw);
      if (!uri) {
        skipped += 1;
        continue;
      }

      let name: string = readName(raw) ?? "";
      if (!name) {
        try {
          name = await AndroidFs.getName(uri);
        } catch {
          name = "item sem nome";
        }
      }

      let type = readType(raw);
      if (!type) {
        try {
          type = String(await AndroidFs.getType(uri)).toLocaleLowerCase("en-US");
        } catch {
          skipped += 1;
          continue;
        }
      }

      if (isDirectoryType(type)) {
        folders += 1;
        const topLevel = current.topLevel ?? name;
        if (!directorySizes.has(topLevel)) {
          directorySizes.set(topLevel, { uri, size: 0, count: 0 });
        }
        queue.push({ uri, name, topLevel });
        continue;
      }

      let size = readKnownSize(raw);
      if (size === null) {
        try {
          size = Number(await AndroidFs.getFileByteLength(uri));
        } catch {
          skipped += 1;
          continue;
        }
      }

      if (!Number.isFinite(size) || size < 0) size = 0;

      bytes += size;
      const file: FileEntry = {
        path: uri,
        name,
        size,
        extension: extensionOf(name),
        modifiedSecs: null,
        ageDays: null
      };
      files.push(file);

      if (current.topLevel) {
        const bucket =
          directorySizes.get(current.topLevel) ??
          { uri: current.uri, size: 0, count: 0 };
        bucket.size += size;
        bucket.count += 1;
        directorySizes.set(current.topLevel, bucket);
      }

      if (files.length % 35 === 0) {
        onProgress({
          root: folderName,
          filesScanned: files.length,
          foldersScanned: folders,
          skippedEntries: skipped,
          bytesScanned: bytes,
          elapsedMs: Math.round(performance.now() - started),
          currentPath: name
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  const extensionMap = new Map<string, { size: number; count: number }>();
  for (const file of files) {
    const bucket = extensionMap.get(file.extension) ?? { size: 0, count: 0 };
    bucket.size += file.size;
    bucket.count += 1;
    extensionMap.set(file.extension, bucket);
  }

  const extensions: ExtensionSummary[] = [...extensionMap.entries()]
    .map(([extension, value]) => ({ extension, ...value }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);

  const directories: DirectorySummary[] = [...directorySizes.entries()]
    .map(([name, value]) => ({
      name,
      path: value.uri,
      size: value.size,
      fileCount: value.count
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 24);

  const largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 100);

  const report: ScanReport = {
    root: folderName,
    indexRoot: rootUri,
    totalSize: bytes,
    fileCount: files.length,
    folderCount: folders,
    skippedEntries: skipped,
    durationMs: Math.round(performance.now() - started),
    indexedFiles: files.length,
    engine: {
      mode: "android-saf",
      label: "Android / SAF",
      accelerated: false,
      fallbackReason: null
    },
    largestFiles,
    extensions,
    directories,
    duplicateCandidates: [],
    recommendations: []
  };

  onProgress({
    root: folderName,
    filesScanned: files.length,
    foldersScanned: folders,
    skippedEntries: skipped,
    bytesScanned: bytes,
    elapsedMs: report.durationMs,
    currentPath: folderName
  });

  return { report, folderName };
}

export default function AndroidApp() {
  const [result, setResult] = useState<MobileResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const topFolders = useMemo(() => result?.report.directories.slice(0, 8) ?? [], [result]);
  const topExtensions = useMemo(() => result?.report.extensions.slice(0, 8) ?? [], [result]);

  async function chooseFolder() {
    if (scanning) return;

    setError(null);
    cancelRef.current = false;

    try {
      const AndroidFs: any = await import("tauri-plugin-android-fs-api");
      const uri = await AndroidFs.showOpenDirPicker();
      if (!uri) return;

      try {
        await AndroidFs.persistPickerUriPermission(uri);
      } catch {
        // A sessão ainda possui a permissão concedida pelo picker.
      }

      let folderName = "Pasta selecionada";
      try {
        folderName = (await AndroidFs.getName(uri)) || folderName;
      } catch {
        // Nome amigável é cosmético; a análise pode seguir.
      }

      setScanning(true);
      setResult(null);
      setProgress({
        root: folderName,
        filesScanned: 0,
        foldersScanned: 0,
        skippedEntries: 0,
        bytesScanned: 0,
        elapsedMs: 0,
        currentPath: folderName
      });

      const scan = await scanSafTree(
        uri,
        folderName,
        setProgress,
        () => cancelRef.current
      );
      setResult(scan);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!message.toLocaleLowerCase("pt-BR").includes("cancelada")) {
        setError(message || "Não foi possível analisar a pasta escolhida.");
      }
    } finally {
      setScanning(false);
    }
  }

  function cancelScan() {
    cancelRef.current = true;
  }

  const report = result?.report ?? null;
  const maxFolderSize = topFolders[0]?.size || 1;
  const maxExtensionSize = topExtensions[0]?.size || 1;

  return (
    <main className="android-shell">
      <header className="android-topbar">
        <div className="android-brand">
          <span className="android-brand-mark">L</span>
          <div>
            <strong>L.I.V.I.A.</strong>
            <span>Android · protótipo 0.8</span>
          </div>
        </div>
        <span className="android-readonly"><ShieldCheck size={15} /> somente leitura</span>
      </header>

      <section className="android-hero">
        <div className="android-hero-icon"><Smartphone size={25} /></div>
        <span className="android-kicker">Storage Access Framework</span>
        <h1>Escolha uma pasta.<br />Eu faço as contas.</h1>
        <p>
          A versão Android só enxerga a pasta que você autorizar. Nada de pedir acesso irrestrito
          ao aparelho para descobrir que a pasta Downloads tem arquivos grandes. A civilização agradece.
        </p>

        <div className="android-actions">
          <button className="android-primary" type="button" onClick={chooseFolder} disabled={scanning}>
            <FolderOpen size={19} />
            {scanning ? "Analisando…" : "Escolher pasta"}
          </button>
          {scanning ? (
            <button className="android-secondary" type="button" onClick={cancelScan}>
              <X size={18} /> Cancelar
            </button>
          ) : null}
        </div>
      </section>

      {progress && scanning ? (
        <section className="android-scan-card" aria-live="polite">
          <div className="android-scan-head">
            <div>
              <span>ANÁLISE LOCAL</span>
              <strong>{progress.root}</strong>
            </div>
            <span className="android-pulse" />
          </div>
          <div className="android-scan-metrics">
            <span><Files size={16} /><strong>{progress.filesScanned.toLocaleString("pt-BR")}</strong> arquivos</span>
            <span><FolderTree size={16} /><strong>{progress.foldersScanned.toLocaleString("pt-BR")}</strong> pastas</span>
            <span><HardDrive size={16} /><strong>{formatBytes(progress.bytesScanned)}</strong> lidos</span>
          </div>
          <p>Agora: {progress.currentPath}</p>
        </section>
      ) : null}

      {error ? (
        <section className="android-error">
          <strong>Não deu certo desta vez.</strong>
          <p>{error}</p>
        </section>
      ) : null}

      {report ? (
        <>
          <section className="android-summary">
            <article>
              <HardDrive size={18} />
              <span>Espaço analisado</span>
              <strong>{formatBytes(report.totalSize)}</strong>
            </article>
            <article>
              <Files size={18} />
              <span>Arquivos</span>
              <strong>{report.fileCount.toLocaleString("pt-BR")}</strong>
            </article>
            <article>
              <FolderTree size={18} />
              <span>Pastas</span>
              <strong>{report.folderCount.toLocaleString("pt-BR")}</strong>
            </article>
            <article>
              <Database size={18} />
              <span>Motor</span>
              <strong>SAF</strong>
            </article>
          </section>

          <section className="android-panel">
            <div className="android-section-title">
              <div><FolderTree size={18} /><strong>Onde está o espaço</strong></div>
              <span>top {topFolders.length}</span>
            </div>
            <div className="android-bars">
              {topFolders.length ? topFolders.map((folder) => (
                <div className="android-bar-row" key={folder.path}>
                  <div><span>{folder.name}</span><strong>{formatBytes(folder.size)}</strong></div>
                  <i><b style={{ width: `${Math.max(3, (folder.size / maxFolderSize) * 100)}%` }} /></i>
                  <small>{folder.fileCount.toLocaleString("pt-BR")} arquivos</small>
                </div>
              )) : <p className="android-empty">Nenhuma subpasta com arquivos encontrada.</p>}
            </div>
          </section>

          <section className="android-panel">
            <div className="android-section-title">
              <div><Search size={18} /><strong>Tipos que mais pesam</strong></div>
              <span>por extensão</span>
            </div>
            <div className="android-bars">
              {topExtensions.map((item) => (
                <div className="android-bar-row" key={item.extension}>
                  <div><span>{item.extension}</span><strong>{formatBytes(item.size)}</strong></div>
                  <i><b style={{ width: `${Math.max(3, (item.size / maxExtensionSize) * 100)}%` }} /></i>
                  <small>{item.count.toLocaleString("pt-BR")} arquivos</small>
                </div>
              ))}
            </div>
          </section>

          <section className="android-panel">
            <div className="android-section-title">
              <div><Files size={18} /><strong>Os grandões</strong></div>
              <span>top 12</span>
            </div>
            <div className="android-file-list">
              {report.largestFiles.slice(0, 12).map((file, index) => (
                <div className="android-file-row" key={file.path}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{file.name}</strong><small>{file.extension}</small></div>
                  <b>{formatBytes(file.size)}</b>
                </div>
              ))}
            </div>
          </section>

          <p className="android-safety-note">
            <ShieldCheck size={16} />
            A v0.8 não apaga, move ou renomeia arquivos no Android. Primeiro informação, depois poderes.
          </p>
        </>
      ) : null}

      <LiviaAssistant
        busy={scanning}
        error={error}
        progress={progress}
        report={report}
      />
    </main>
  );
}
