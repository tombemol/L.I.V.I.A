import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  FolderOpen,
  Moon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sun,
  X
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DistributionPie } from "./components/DistributionPie";
import { LiviaAssistant } from "./components/LiviaAssistant";
import { formatBytes, formatDuration } from "./lib/format";
import type { FileEntry, Recommendation, ScanProgress, ScanReport } from "./types";
import type { EntryMetadataWithUri, FsUri } from "tauri-plugin-android-fs-api";
import { version as appVersion } from "../package.json";

const MAX_ENTRIES = 250_000;
const LARGEST_LIMIT = 80;
const RECOMMENDATION_LIMIT = 40;

type Theme = "dark" | "light";

type Bucket = {
  label: string;
  path: string;
  size: number;
  count: number;
};

type QueueItem = {
  uri: FsUri;
  logicalPath: string;
  topLevel: string | null;
};

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "sem extensão";
  return name.slice(dot).toLocaleLowerCase("pt-BR");
}

function ageInDays(date: Date) {
  const value = date.getTime();
  if (!Number.isFinite(value) || value <= 0) return null;
  const delta = Date.now() - value;
  if (delta <= 0) return 0;
  return Math.floor(delta / 86_400_000);
}

function toRecommendation(file: FileEntry): Recommendation | null {
  const gb = 1024 ** 3;
  const age = file.ageDays ?? 0;

  if (file.size >= 5 * gb) {
    return {
      path: file.path,
      name: file.name,
      size: file.size,
      ageDays: file.ageDays,
      category: "Arquivo muito grande",
      reason: "Ocupa pelo menos 5 GB no armazenamento selecionado.",
      risk: "Revisar",
      confidence: 64
    };
  }

  if (file.size >= 2 * gb && age >= 180) {
    return {
      path: file.path,
      name: file.name,
      size: file.size,
      ageDays: file.ageDays,
      category: "Arquivo grande e antigo",
      reason: "Ocupa pelo menos 2 GB e não é alterado há mais de seis meses.",
      risk: "Revisar",
      confidence: 70
    };
  }

  return null;
}

function keepLargest(list: FileEntry[], file: FileEntry) {
  list.push(file);
  if (list.length > LARGEST_LIMIT + 32) {
    list.sort((a, b) => b.size - a.size);
    list.length = LARGEST_LIMIT;
  }
}

function pushBucket(map: Map<string, Bucket>, key: string, size: number, path: string) {
  const current = map.get(key);
  if (current) {
    current.size += size;
    current.count += 1;
    return;
  }
  map.set(key, { label: key, path, size, count: 1 });
}

async function scanSafTree(
  rootUri: FsUri,
  onProgress: (progress: ScanProgress) => void,
  shouldCancel: () => boolean
): Promise<ScanReport> {
  const AndroidFs = await import("tauri-plugin-android-fs-api");
  const started = performance.now();
  const queue: QueueItem[] = [
    {
      uri: rootUri,
      logicalPath: "Pasta selecionada",
      topLevel: null
    }
  ];

  const largest: FileEntry[] = [];
  const recommendations: Recommendation[] = [];
  const extensions = new Map<string, Bucket>();
  const directories = new Map<string, Bucket>();

  let fileCount = 0;
  let folderCount = 0;
  let skippedEntries = 0;
  let totalSize = 0;
  let processedEntries = 0;
  let capped = false;

  while (queue.length) {
    if (shouldCancel()) throw new Error("Análise cancelada.");

    const current = queue.shift()!;
    let entries: EntryMetadataWithUri[];

    try {
      entries = await AndroidFs.readDir(current.uri);
    } catch {
      skippedEntries += 1;
      continue;
    }

    for (const entry of entries) {
      if (shouldCancel()) throw new Error("Análise cancelada.");

      processedEntries += 1;
      if (processedEntries > MAX_ENTRIES) {
        capped = true;
        queue.length = 0;
        break;
      }

      const logicalPath = `${current.logicalPath}/${entry.name}`;

      if (entry.type === "Dir") {
        folderCount += 1;
        queue.push({
          uri: entry.uri,
          logicalPath,
          topLevel: current.topLevel ?? entry.name
        });
      } else {
        fileCount += 1;
        const size = Math.max(0, Number(entry.byteLength) || 0);
        totalSize += size;

        const ageDays = ageInDays(entry.lastModified);
        const file: FileEntry = {
          path: logicalPath,
          name: entry.name,
          size,
          extension: extensionOf(entry.name),
          modifiedSecs:
            entry.lastModified instanceof Date && Number.isFinite(entry.lastModified.getTime())
              ? Math.floor(entry.lastModified.getTime() / 1000)
              : null,
          ageDays
        };

        keepLargest(largest, file);

        const recommendation = toRecommendation(file);
        if (recommendation && recommendations.length < RECOMMENDATION_LIMIT * 2) {
          recommendations.push(recommendation);
        }

        const topLevel = current.topLevel ?? "(raiz)";
        pushBucket(directories, topLevel, size, `Pasta selecionada/${topLevel}`);
        pushBucket(extensions, file.extension, size, file.extension);
      }

      if (processedEntries % 150 === 0) {
        onProgress({
          root: "Android SAF",
          filesScanned: fileCount,
          foldersScanned: folderCount,
          skippedEntries,
          bytesScanned: totalSize,
          elapsedMs: Math.round(performance.now() - started),
          currentPath: logicalPath
        });
      }

      if (processedEntries % 1200 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
  }

  largest.sort((a, b) => b.size - a.size);
  largest.length = Math.min(largest.length, LARGEST_LIMIT);

  recommendations.sort(
    (a, b) => b.confidence - a.confidence || b.size - a.size
  );
  recommendations.length = Math.min(recommendations.length, RECOMMENDATION_LIMIT);

  const extensionList = [...extensions.values()]
    .sort((a, b) => b.size - a.size)
    .slice(0, 20)
    .map((item) => ({
      extension: item.label,
      size: item.size,
      count: item.count
    }));

  const directoryList = [...directories.values()]
    .sort((a, b) => b.size - a.size)
    .slice(0, 20)
    .map((item) => ({
      name: item.label,
      path: item.path,
      size: item.size,
      fileCount: item.count
    }));

  const durationMs = Math.round(performance.now() - started);
  onProgress({
    root: "Android SAF",
    filesScanned: fileCount,
    foldersScanned: folderCount,
    skippedEntries,
    bytesScanned: totalSize,
    elapsedMs: durationMs,
    currentPath: "Pasta selecionada"
  });

  return {
    root: "Pasta selecionada no Android",
    indexRoot: "Android SAF",
    totalSize,
    fileCount,
    folderCount,
    skippedEntries,
    durationMs,
    indexedFiles: fileCount,
    engine: {
      mode: "android-saf",
      label: "Android / Storage Access Framework",
      accelerated: false,
      fallbackReason: capped
        ? `O protótipo interrompe a enumeração em ${MAX_ENTRIES.toLocaleString("pt-BR")} entradas para preservar memória e responsividade.`
        : null
    },
    largestFiles: largest,
    extensions: extensionList,
    directories: directoryList,
    duplicateCandidates: [],
    recommendations
  };
}

function MobileMark() {
  return (
    <img
      className="android-brand-mark"
      src="/livia/livia-mark.svg"
      alt=""
      aria-hidden="true"
    />
  );
}

export default function AndroidApp() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("livia-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [report, setReport] = useState<ScanReport | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [scanMode, setScanMode] = useState<"saf" | "device" | null>(null);
  const [permissionNote, setPermissionNote] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("livia-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;

    listen<ScanProgress>("scan-progress", ({ payload }) => {
      if (active && scanMode === "device") setProgress(payload);
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      dispose?.();
    };
  }, [scanMode]);

  const folderPie = useMemo(
    () =>
      report?.directories.map((item) => ({
        label: item.name,
        value: item.size,
        detail: `${item.fileCount.toLocaleString("pt-BR")} arquivo(s)`
      })) ?? [],
    [report]
  );

  const extensionPie = useMemo(
    () =>
      report?.extensions.map((item) => ({
        label: item.extension,
        value: item.size,
        detail: `${item.count.toLocaleString("pt-BR")} arquivo(s)`
      })) ?? [],
    [report]
  );

  async function chooseAndScan() {
    setError(null);
    setPermissionNote(null);
    setSelectedFile(null);
    setScanMode("saf");

    try {
      const AndroidFs = await import("tauri-plugin-android-fs-api");
      const uri = await AndroidFs.showOpenDirPicker({ localOnly: false });
      if (!uri) return;

      try {
        await AndroidFs.persistPickerUriPermission(uri);
      } catch {
        // A permissão da sessão ainda permite a análise atual.
      }

      cancelRef.current = false;
      setBusy(true);
      setReport(null);
      setProgress({
        root: "Android SAF",
        filesScanned: 0,
        foldersScanned: 0,
        skippedEntries: 0,
        bytesScanned: 0,
        elapsedMs: 0,
        currentPath: "Preparando acesso à pasta…"
      });

      const result = await scanSafTree(
        uri,
        setProgress,
        () => cancelRef.current
      );
      setReport(result);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Não foi possível analisar a pasta selecionada.";

      if (!message.toLocaleLowerCase("pt-BR").includes("cancelada")) {
        setError(message);
      }
    } finally {
      setBusy(false);
      cancelRef.current = false;
    }
  }

  async function scanWholeStorage() {
    setError(null);
    setPermissionNote(null);
    setSelectedFile(null);

    try {
      const granted = await invoke<boolean>("android_all_files_access");

      if (!granted) {
        await invoke("android_request_all_files_access");
        setPermissionNote(
          "O Android abriu a permissão de acesso amplo. Ative a L.I.V.I.A., volte para o app e toque novamente em “Analisar armazenamento inteiro”."
        );
        return;
      }

      const root = await invoke<string>("android_shared_storage_root");
      cancelRef.current = false;
      setScanMode("device");
      setBusy(true);
      setReport(null);
      setProgress({
        root,
        filesScanned: 0,
        foldersScanned: 0,
        skippedEntries: 0,
        bytesScanned: 0,
        elapsedMs: 0,
        currentPath: root
      });

      const result = await invoke<ScanReport>("scan_path", { path: root });
      setReport(result);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Não foi possível analisar o armazenamento compartilhado.";

      if (!message.toLocaleLowerCase("pt-BR").includes("cancelada")) {
        setError(message);
      }
    } finally {
      setBusy(false);
      cancelRef.current = false;
    }
  }

  return (
    <div className="android-shell">
      <header className="android-topbar">
        <div className="android-brand">
          <MobileMark />
          <div>
            <strong>L.I.V.I.A.</strong>
            <span>Android · v{appVersion}</span>
          </div>
        </div>

        <button
          className="android-icon-button"
          type="button"
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          aria-label="Alternar tema"
        >
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </header>

      <main className="android-main">
        {!report && !busy ? (
          <section className="android-intro">
            <span className="android-kicker"><Smartphone size={15} /> ANDROID</span>
            <h1>Veja onde o telefone está escondendo espaço.</h1>
            <p>
              A L.I.V.I.A. pode analisar o armazenamento compartilhado inteiro ou,
              se você preferir, somente uma pasta escolhida pelo seletor do Android.
              Tudo continua sendo processado localmente.
            </p>

            <div className="android-actions">
              <button className="android-primary" type="button" onClick={scanWholeStorage}>
                <Smartphone size={18} />
                Analisar armazenamento inteiro
              </button>

              <button className="android-secondary" type="button" onClick={chooseAndScan}>
                <FolderOpen size={18} />
                Escolher uma pasta
              </button>
            </div>

            {permissionNote ? (
              <div className="android-permission-note">{permissionNote}</div>
            ) : null}

            <div className="android-safety">
              <ShieldCheck size={19} />
              <div>
                <strong>Acesso amplo opcional e somente leitura</strong>
                <span>
                  A análise inteira exige a permissão especial do Android. A L.I.V.I.A.
                  não apaga nada nesta fase e o sistema ainda protege áreas privadas de outros apps.
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {busy ? (
          <section className="android-scanning">
            <span className="android-kicker">
              {scanMode === "device" ? "ANALISANDO ARMAZENAMENTO" : "ANALISANDO VIA SAF"}
            </span>
            <h1>
              {scanMode === "device"
                ? "Estou varrendo o armazenamento compartilhado."
                : "Estou contando a bagunça autorizada."}
            </h1>
            <p className="android-current-path">{progress?.currentPath ?? "Preparando…"}</p>

            <div className="android-progress-track"><span /></div>

            <div className="android-metrics-grid">
              <div><span>Arquivos</span><strong>{(progress?.filesScanned ?? 0).toLocaleString("pt-BR")}</strong></div>
              <div><span>Pastas</span><strong>{(progress?.foldersScanned ?? 0).toLocaleString("pt-BR")}</strong></div>
              <div><span>Lidos</span><strong>{formatBytes(progress?.bytesScanned ?? 0)}</strong></div>
              <div><span>Tempo</span><strong>{formatDuration(progress?.elapsedMs ?? 0)}</strong></div>
            </div>

            <button
              className="android-secondary"
              type="button"
              onClick={() => {
                cancelRef.current = true;
                if (scanMode === "device") {
                  void invoke("cancel_scan").catch(() => undefined);
                }
              }}
            >
              <X size={17} />
              Cancelar
            </button>
          </section>
        ) : null}

        {report && !busy ? (
          <section className="android-report">
            <div className="android-report-head">
              <div>
                <span className="android-kicker">ANÁLISE CONCLUÍDA</span>
                <h1>{formatBytes(report.totalSize)} encontrados</h1>
                <p>
                  {report.fileCount.toLocaleString("pt-BR")} arquivos em {report.folderCount.toLocaleString("pt-BR")} pastas · {formatDuration(report.durationMs)}
                </p>
              </div>
              <button
                className="android-icon-button"
                type="button"
                onClick={scanMode === "device" ? scanWholeStorage : chooseAndScan}
                aria-label={scanMode === "device" ? "Analisar novamente" : "Analisar outra pasta"}
              >
                <RefreshCw size={19} />
              </button>
            </div>

            {report.engine.fallbackReason ? (
              <div className="android-warning">{report.engine.fallbackReason}</div>
            ) : null}

            <div className="android-metrics-grid report">
              <div><span>Tamanho</span><strong>{formatBytes(report.totalSize)}</strong></div>
              <div><span>Arquivos</span><strong>{report.fileCount.toLocaleString("pt-BR")}</strong></div>
              <div><span>Pastas</span><strong>{report.folderCount.toLocaleString("pt-BR")}</strong></div>
              <div><span>Ignorados</span><strong>{report.skippedEntries.toLocaleString("pt-BR")}</strong></div>
            </div>

            <article className="android-card">
              <div className="android-card-head">
                <div>
                  <span>PASTAS</span>
                  <h2>Onde está o peso</h2>
                </div>
              </div>
              <DistributionPie data={folderPie} ariaLabel="Distribuição por pasta no Android" maxSlices={7} />
            </article>

            <article className="android-card">
              <div className="android-card-head">
                <div>
                  <span>EXTENSÕES</span>
                  <h2>Tipos que mais ocupam espaço</h2>
                </div>
              </div>
              <DistributionPie data={extensionPie} ariaLabel="Distribuição por extensão no Android" compact maxSlices={7} />
            </article>

            <article className="android-card">
              <div className="android-card-head">
                <div>
                  <span>MAIORES ARQUIVOS</span>
                  <h2>Os grandões da pasta</h2>
                </div>
              </div>

              <div className="android-file-list">
                {report.largestFiles.slice(0, 30).map((file, index) => (
                  <button
                    type="button"
                    className={selectedFile?.path === file.path ? "selected" : ""}
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                  >
                    <span className="android-file-rank">{String(index + 1).padStart(2, "0")}</span>
                    <FileText size={17} />
                    <span className="android-file-copy">
                      <strong>{file.name}</strong>
                      <small>{file.path}</small>
                    </span>
                    <b>{formatBytes(file.size)}</b>
                  </button>
                ))}
              </div>
            </article>

            <div className="android-readonly-note">
              <ShieldCheck size={17} />
              A v0.8 analisa e explica. Remoção de arquivos continua desativada no Android.
            </div>
          </section>
        ) : null}

        {error ? <div className="android-error">{error}</div> : null}
      </main>

      <LiviaAssistant
        busy={busy}
        error={error}
        progress={progress}
        report={report}
        selectedFile={selectedFile}
      />
    </div>
  );
}
