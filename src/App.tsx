import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  FileArchive,
  Files,
  Filter,
  Fingerprint,
  FolderOpen,
  Gauge,
  HardDrive,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  Zap
} from "lucide-react";
import { StorageTreemap } from "./components/StorageTreemap";
import { ExtensionList } from "./components/ExtensionList";
import { formatAge, formatBytes, formatDuration, shortPath } from "./lib/format";
import type {
  DuplicateProgress,
  DuplicateReport,
  FileEntry,
  ScanProgress,
  ScanReport,
  SearchResponse
} from "./types";

function LogoGlyph() {
  return (
    <div className="logo-glyph" aria-hidden="true">
      <svg viewBox="0 0 32 32" role="presentation">
        <rect className="logo-frame" x="1.5" y="1.5" width="29" height="29" rx="7" />
        <path className="logo-l" d="M9 8.5v14.75c0 1.1.9 2 2 2h11.5" />
        <rect className="logo-bar" x="16.5" y="9" width="7.5" height="5" rx="1.5" />
        <rect className="logo-chip" x="16.5" y="17" width="3.4" height="3.4" rx="1" />
        <rect className="logo-chip logo-chip-dim" x="21" y="17" width="3.4" height="3.4" rx="1" />
      </svg>
    </div>
  );
}

function Brand({ detail }: { detail?: string }) {
  return (
    <div className="brand-line">
      <LogoGlyph />
      <div>
        <strong>L.I.V.I.A.</strong>
        <span>{detail ?? "Analisador de armazenamento"}</span>
      </div>
    </div>
  );
}

type Theme = "dark" | "light";
type SortKey = "size" | "name" | "age" | "extension";
type SortDirection = "asc" | "desc";

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === "dark" ? "claro" : "escuro";
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      title={`Mudar para tema ${next}`}
      aria-label={`Mudar para tema ${next}`}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
    </button>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}

function buildBreadcrumbs(path: string, indexRoot: string) {
  const normalized = path.replaceAll("/", "\\");
  const normalizedIndexRoot = indexRoot.replaceAll("/", "\\").replace(/\\+$/, "");
  const drive = normalized.match(/^([A-Za-z]:)\\?/)?.[1];

  if (!drive) {
    return [{ label: normalized, path: normalized }];
  }

  const root = `${drive}\\`;
  const rest = normalized.slice(root.length).split("\\").filter(Boolean);
  let current = root;
  const crumbs: Array<{ label: string; path: string }> = [];

  for (const part of [root, ...rest]) {
    if (part === root) {
      current = root;
    } else {
      current = current.endsWith("\\") ? `${current}${part}` : `${current}\\${part}`;
    }

    const normalizedCurrent = current.replace(/\\+$/, "");
    const insideIndex =
      normalizedCurrent.toLocaleLowerCase("pt-BR") === normalizedIndexRoot.toLocaleLowerCase("pt-BR") ||
      normalizedCurrent
        .toLocaleLowerCase("pt-BR")
        .startsWith(`${normalizedIndexRoot.toLocaleLowerCase("pt-BR")}\\`);

    if (insideIndex) {
      crumbs.push({ label: part === root ? root : part, path: current });
    }
  }

  return crumbs.length ? crumbs : [{ label: shortPath(path, 52), path }];
}

function formatModified(seconds: number | null) {
  if (!seconds) return "Data indisponível";
  return new Date(seconds * 1000).toLocaleString("pt-BR");
}

export default function App() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [systemDrive, setSystemDrive] = useState("C:\\");
  const [query, setQuery] = useState("");
  const [extensionFilter, setExtensionFilter] = useState("all");
  const [minSize, setMinSize] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("size");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse>({
    total: 0,
    durationMs: 0,
    files: []
  });
  const [searching, setSearching] = useState(false);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [duplicateProgress, setDuplicateProgress] = useState<DuplicateProgress | null>(null);
  const [duplicateReport, setDuplicateReport] = useState<DuplicateReport | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("livia-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("livia-theme", theme);
  }, [theme]);

  useEffect(() => {
    invoke<string>("system_drive")
      .then(setSystemDrive)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;

    listen<ScanProgress>("scan-progress", ({ payload }) => {
      if (active) setProgress(payload);
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;

    listen<DuplicateProgress>("duplicate-progress", ({ payload }) => {
      if (active) setDuplicateProgress(payload);
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    if (!report || busy) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const result = await invoke<SearchResponse>("search_index", {
          scope: report.root,
          query,
          extension: extensionFilter,
          minSize,
          sortKey,
          sortDirection,
          limit: 200
        });
        if (active) setSearchResult(result);
      } catch (reason) {
        if (active) {
          setError(typeof reason === "string" ? reason : "Não foi possível pesquisar o índice.");
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 140);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [report, busy, query, extensionFilter, minSize, sortKey, sortDirection]);

  const reclaimable = useMemo(
    () => report?.recommendations.reduce((sum, item) => sum + item.size, 0) ?? 0,
    [report]
  );

  const breadcrumbs = useMemo(
    () => (report ? buildBreadcrumbs(report.root, report.indexRoot) : []),
    [report]
  );

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function changeSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "name" || key === "extension" ? "asc" : "desc");
  }

  async function chooseAndScan() {
    setError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Escolha uma pasta ou unidade para analisar"
    });

    if (typeof selected === "string") await scan(selected);
  }

  async function scan(path: string) {
    if (busy) return;

    setBusy(true);
    setCancelRequested(false);
    setError(null);
    setSelectedFile(null);
    setQuery("");
    setExtensionFilter("all");
    setMinSize(0);
    setSearchResult({ total: 0, durationMs: 0, files: [] });
    setDuplicateBusy(false);
    setDuplicateProgress(null);
    setDuplicateReport(null);
    setProgress({
      root: path,
      filesScanned: 0,
      foldersScanned: 0,
      skippedEntries: 0,
      bytesScanned: 0,
      elapsedMs: 0,
      currentPath: path
    });

    try {
      const result = await invoke<ScanReport>("scan_path", { path });
      setReport(result);
    } catch (reason) {
      const message =
        typeof reason === "string" ? reason : "Não foi possível analisar este caminho.";

      if (!message.toLocaleLowerCase("pt-BR").includes("cancelada")) {
        setError(message);
      }
    } finally {
      setBusy(false);
      setCancelRequested(false);
    }
  }

  async function browse(path: string) {
    if (!report || browsing || path === report.root) return;

    setBrowsing(true);
    setSelectedFile(null);
    setDuplicateProgress(null);
    setDuplicateReport(null);
    setError(null);

    try {
      const result = await invoke<ScanReport>("browse_index", { path });
      setReport(result);
    } catch (reason) {
      setError(typeof reason === "string" ? reason : "Não foi possível navegar neste caminho.");
    } finally {
      setBrowsing(false);
    }
  }

  async function cancelScan() {
    setCancelRequested(true);
    try {
      await invoke("cancel_scan");
    } catch {
      setCancelRequested(false);
    }
  }

  async function openInExplorer(path: string) {
    try {
      await invoke("open_in_explorer", { path });
    } catch (reason) {
      setError(typeof reason === "string" ? reason : "Não foi possível abrir este local.");
    }
  }

  async function verifyDuplicates() {
    if (!report || duplicateBusy) return;

    setDuplicateBusy(true);
    setDuplicateReport(null);
    setDuplicateProgress(null);
    setError(null);

    try {
      const result = await invoke<DuplicateReport>("find_duplicates", { scope: report.root });
      setDuplicateReport(result);
    } catch (reason) {
      setError(
        typeof reason === "string"
          ? reason
          : "Não foi possível confirmar os arquivos duplicados."
      );
    } finally {
      setDuplicateBusy(false);
    }
  }

  if (busy) {
    return (
      <main className="utility-shell">
        <header className="topbar">
          <Brand detail="Indexando armazenamento" />
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <span className="version-pill">v0.2.2</span>
          </div>
        </header>

        <section className="scan-stage">
          <div className="scan-heading">
            <span className="section-kicker">VARREDURA + ÍNDICE</span>
            <h1>Analisando {shortPath(progress?.root ?? "", 52)}</h1>
            <p>
              A L.I.V.I.A. está construindo o índice da sessão. Depois disso, busca e navegação
              acontecem sem percorrer o disco outra vez.
            </p>
          </div>

          <div className="scan-progress" aria-label="Análise em andamento"><span /></div>

          <div className="scan-metrics">
            <Metric label="ARQUIVOS" value={(progress?.filesScanned ?? 0).toLocaleString("pt-BR")} detail="indexados até agora" />
            <Metric label="PASTAS" value={(progress?.foldersScanned ?? 0).toLocaleString("pt-BR")} detail="percorridas" />
            <Metric label="DADOS" value={formatBytes(progress?.bytesScanned ?? 0)} detail="contabilizados" />
            <Metric label="TEMPO" value={formatDuration(progress?.elapsedMs ?? 0)} detail="decorrido" />
          </div>

          <div className="current-path">
            <span>Agora</span>
            <code title={progress?.currentPath}>{shortPath(progress?.currentPath ?? progress?.root ?? "", 96)}</code>
          </div>

          <div className="scan-actions">
            <div className="scan-note">
              <Database size={15} />
              <span>
                O índice fica apenas nesta sessão. {progress?.skippedEntries ?? 0} entradas
                inacessíveis foram ignoradas.
              </span>
            </div>
            <button className="danger-action" type="button" onClick={cancelScan} disabled={cancelRequested}>
              <X size={16} />
              {cancelRequested ? "Cancelando…" : "Cancelar"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="utility-shell">
        <header className="topbar">
          <Brand />
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <span className="version-pill">v0.2.2</span>
          </div>
        </header>

        <section className="start-stage">
          <div className="start-heading">
            <span className="section-kicker">ANÁLISE LOCAL · WINDOWS</span>
            <h1>Indexar armazenamento</h1>
            <p>
              Uma análise cria um índice temporário dos arquivos. A busca global e o drill-down
              usam esse índice sem reanalisar o disco a cada clique.
            </p>
          </div>

          <div className="target-list">
            <div className="target-row">
              <div className="target-icon"><HardDrive size={20} /></div>
              <div className="target-copy">
                <strong>Disco do sistema</strong>
                <span>{systemDrive} · tenta MFT quando disponível e usa fallback seguro quando não estiver</span>
              </div>
              <button className="primary-action" type="button" onClick={() => scan(systemDrive)}>Indexar</button>
            </div>

            <div className="target-row">
              <div className="target-icon"><FolderOpen size={20} /></div>
              <div className="target-copy">
                <strong>Outra pasta ou unidade</strong>
                <span>Cria um índice somente do local selecionado</span>
              </div>
              <button className="secondary-action" type="button" onClick={chooseAndScan}>Escolher</button>
            </div>
          </div>

          <div className="privacy-line">
            <ShieldCheck size={16} />
            <div>
              <strong>Somente leitura</strong>
              <span>O índice existe apenas em memória e não envia dados para fora do computador.</span>
            </div>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="report-shell">
      <header className="topbar report-topbar">
        <Brand detail={shortPath(report.root, 54)} />
        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button className="secondary-action" type="button" onClick={() => scan(report.indexRoot)}>
            <RefreshCw size={15} /> Reindexar
          </button>
          <button className="primary-action compact" type="button" onClick={chooseAndScan}>
            <FolderOpen size={15} /> Novo local
          </button>
        </div>
      </header>

      <nav className="breadcrumb-bar" aria-label="Caminho analisado">
        {breadcrumbs.map((crumb, index) => (
          <span className="breadcrumb-part" key={crumb.path}>
            {index ? <ChevronRight size={13} /> : null}
            <button
              type="button"
              disabled={crumb.path === report.root || browsing}
              onClick={() => browse(crumb.path)}
            >
              {crumb.label}
            </button>
          </span>
        ))}
        {browsing ? <span className="breadcrumb-status">consultando índice…</span> : null}
      </nav>

      <section className="report-summary">
        <div className="report-title">
          <span className="section-kicker">RESULTADO INDEXADO</span>
          <h1 title={report.root}>{shortPath(report.root, 76)}</h1>
          <p>{formatBytes(report.totalSize)} encontrados em {report.fileCount.toLocaleString("pt-BR")} arquivos neste recorte.</p>
        </div>

        <div className="review-summary">
          <span className="metric-label">MERECE REVISÃO</span>
          <strong>{formatBytes(reclaimable)}</strong>
          <span>{report.recommendations.length} itens sinalizados</span>
        </div>
      </section>

      <section className={`engine-strip${report.engine.accelerated ? " accelerated" : ""}`}>
        <div className="engine-main">
          {report.engine.accelerated ? <Zap size={16} /> : <Database size={16} />}
          <div>
            <strong>{report.engine.label}</strong>
            <span>
              {report.engine.accelerated
                ? "Enumeração NTFS/MFT ativa nesta análise."
                : "Índice construído pela travessia compatível do sistema de arquivos."}
            </span>
          </div>
        </div>
        <div className="engine-stats">
          <Gauge size={14} />
          <span>{report.indexedFiles.toLocaleString("pt-BR")} arquivos no índice da sessão</span>
        </div>
        {report.engine.fallbackReason ? (
          <p className="engine-fallback">{report.engine.fallbackReason}</p>
        ) : null}
      </section>

      <section className="metrics-strip">
        <Metric label="ARQUIVOS" value={report.fileCount.toLocaleString("pt-BR")} detail="neste caminho" />
        <Metric label="PASTAS" value={report.folderCount.toLocaleString("pt-BR")} detail="neste caminho" />
        <Metric label="CONSULTA" value={formatDuration(report.durationMs)} detail={report.root === report.indexRoot ? "indexação inicial" : "via índice"} />
        <Metric label="IGNORADOS" value={report.skippedEntries.toLocaleString("pt-BR")} detail="sem acesso" />
      </section>

      <section className="analysis-grid">
        <article className="surface treemap-surface">
          <div className="section-heading">
            <div>
              <span className="section-kicker">MAPA DE ESPAÇO</span>
              <h2>Distribuição por pasta</h2>
            </div>
            <HardDrive size={19} />
          </div>
          <StorageTreemap data={report.directories} onNavigate={(path) => path !== report.root && browse(path)} />
          <p className="section-note">Clique em um bloco para navegar usando o índice, sem nova varredura física.</p>
        </article>

        <article className="surface extension-surface">
          <div className="section-heading">
            <div>
              <span className="section-kicker">TIPOS</span>
              <h2>Extensões mais pesadas</h2>
            </div>
            <FileArchive size={19} />
          </div>
          <ExtensionList data={report.extensions} />
        </article>
      </section>

      <section className="surface explorer-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">BUSCA GLOBAL NO ÍNDICE</span>
            <h2>Arquivos em {shortPath(report.root, 56)}</h2>
          </div>
          <Search size={19} />
        </div>

        <div className="explorer-toolbar">
          <label className="search-control">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar em todos os arquivos indexados deste caminho"
              aria-label="Pesquisar no índice"
            />
          </label>

          <label className="select-control">
            <Filter size={14} />
            <select value={extensionFilter} onChange={(event) => setExtensionFilter(event.target.value)} aria-label="Filtrar por extensão">
              <option value="all">Todas as extensões</option>
              {report.extensions.map((item) => (
                <option key={item.extension} value={item.extension}>{item.extension}</option>
              ))}
            </select>
          </label>

          <label className="select-control">
            <HardDrive size={14} />
            <select value={minSize} onChange={(event) => setMinSize(Number(event.target.value))} aria-label="Tamanho mínimo">
              <option value={0}>Qualquer tamanho</option>
              <option value={10 * 1024 * 1024}>≥ 10 MB</option>
              <option value={100 * 1024 * 1024}>≥ 100 MB</option>
              <option value={500 * 1024 * 1024}>≥ 500 MB</option>
              <option value={1024 * 1024 * 1024}>≥ 1 GB</option>
              <option value={5 * 1024 * 1024 * 1024}>≥ 5 GB</option>
            </select>
          </label>
        </div>

        <div className="search-summary">
          <span>
            {searching
              ? "Pesquisando…"
              : `${searchResult.total.toLocaleString("pt-BR")} resultados · ${formatDuration(searchResult.durationMs)}`}
          </span>
          <small>Mostrando até 200 resultados por consulta.</small>
        </div>

        <div className="explorer-layout">
          <div className="explorer-table">
            <div className="explorer-row explorer-head">
              <button type="button" onClick={() => changeSort("name")}>Arquivo <ArrowUpDown size={12} /></button>
              <button type="button" onClick={() => changeSort("extension")}>Tipo <ArrowUpDown size={12} /></button>
              <button type="button" onClick={() => changeSort("age")}>Modificado <ArrowUpDown size={12} /></button>
              <button type="button" onClick={() => changeSort("size")}>Tamanho <ArrowUpDown size={12} /></button>
            </div>

            <div className="explorer-scroll">
              {searchResult.files.map((file) => (
                <button
                  className={`explorer-row explorer-file${selectedFile?.path === file.path ? " selected" : ""}`}
                  type="button"
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  onDoubleClick={() => openInExplorer(file.path)}
                >
                  <span className="file-name-cell">
                    <strong>{file.name}</strong>
                    <small title={file.path}>{shortPath(file.path, 78)}</small>
                  </span>
                  <span>{file.extension}</span>
                  <span><Clock3 size={12} /> {formatAge(file.ageDays)}</span>
                  <strong>{formatBytes(file.size)}</strong>
                </button>
              ))}

              {!searching && !searchResult.files.length ? (
                <div className="explorer-empty">Nenhum arquivo do índice corresponde aos filtros.</div>
              ) : null}
            </div>
          </div>

          <aside className="detail-panel">
            {selectedFile ? (
              <>
                <span className="section-kicker">DETALHES</span>
                <h3>{selectedFile.name}</h3>
                <code title={selectedFile.path}>{selectedFile.path}</code>
                <dl>
                  <div><dt>Tamanho</dt><dd>{formatBytes(selectedFile.size)}</dd></div>
                  <div><dt>Tipo</dt><dd>{selectedFile.extension}</dd></div>
                  <div><dt>Modificado</dt><dd>{formatModified(selectedFile.modifiedSecs)}</dd></div>
                  <div><dt>Idade</dt><dd>{formatAge(selectedFile.ageDays)}</dd></div>
                </dl>
                <button className="primary-action detail-action" type="button" onClick={() => openInExplorer(selectedFile.path)}>
                  <ExternalLink size={15} /> Mostrar no Explorer
                </button>
              </>
            ) : (
              <div className="detail-empty">
                <Files size={22} />
                <strong>Selecione um arquivo</strong>
                <span>Os resultados agora vêm do índice inteiro, não só dos maiores arquivos.</span>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section className="surface duplicates-section">
        <div className="section-heading duplicate-heading">
          <div>
            <span className="section-kicker">DUPLICATAS · BLAKE3</span>
            <h2>Confirmação por conteúdo</h2>
          </div>
          <button
            className="secondary-action compact"
            type="button"
            onClick={verifyDuplicates}
            disabled={duplicateBusy}
          >
            <Fingerprint size={15} />
            {duplicateBusy ? "Verificando…" : duplicateReport ? "Verificar novamente" : "Confirmar por hash"}
          </button>
        </div>

        {duplicateBusy ? (
          <div className="duplicate-progress-card">
            <div className="duplicate-progress-copy">
              <Fingerprint size={18} />
              <div>
                <strong>
                  {duplicateProgress?.phase === "full"
                    ? "Confirmando arquivos completos"
                    : "Filtrando candidatos por amostras"}
                </strong>
                <span title={duplicateProgress?.currentPath}>
                  {shortPath(duplicateProgress?.currentPath ?? report.root, 86)}
                </span>
              </div>
            </div>
            <div className="duplicate-progress-stats">
              <span><strong>{(duplicateProgress?.candidateFiles ?? 0).toLocaleString("pt-BR")}</strong> candidatos</span>
              <span><strong>{(duplicateProgress?.partialHashedFiles ?? 0).toLocaleString("pt-BR")}</strong> amostras</span>
              <span><strong>{(duplicateProgress?.fullyHashedFiles ?? 0).toLocaleString("pt-BR")}</strong> completos</span>
              <span><strong>{formatDuration(duplicateProgress?.elapsedMs ?? 0)}</strong> decorridos</span>
            </div>
          </div>
        ) : duplicateReport ? (
          <>
            <div className="duplicate-result-summary">
              <div>
                <span className="metric-label">DUPLICATAS CONFIRMADAS</span>
                <strong>{duplicateReport.groups.length.toLocaleString("pt-BR")} grupos</strong>
              </div>
              <div>
                <span className="metric-label">ESPAÇO RECUPERÁVEL</span>
                <strong>{formatBytes(duplicateReport.reclaimableBytes)}</strong>
              </div>
              <div>
                <span className="metric-label">HASH COMPLETO</span>
                <strong>{duplicateReport.fullyHashedFiles.toLocaleString("pt-BR")}</strong>
              </div>
              <div>
                <span className="metric-label">TEMPO</span>
                <strong>{formatDuration(duplicateReport.durationMs)}</strong>
              </div>
            </div>

            {duplicateReport.groups.length ? (
              <div className="duplicate-list verified">
                {duplicateReport.groups.slice(0, 12).map((group) => (
                  <div className="duplicate-group" key={group.hash}>
                    <div className="duplicate-summary">
                      <strong>{formatBytes(group.reclaimableBytes)} recuperáveis</strong>
                      <span>{group.count} arquivos idênticos · {formatBytes(group.size)} cada</span>
                      <code title={group.hash}>{group.hash.slice(0, 18)}…</code>
                    </div>
                    <div className="duplicate-files">
                      {group.files.slice(0, 6).map((file) => (
                        <button
                          type="button"
                          key={file.path}
                          onClick={() => setSelectedFile(file)}
                          onDoubleClick={() => openInExplorer(file.path)}
                          title={file.path}
                        >
                          {file.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="calm-empty duplicate-empty">
                <ShieldCheck size={19} />
                <div>
                  <strong>Nenhuma duplicata confirmada.</strong>
                  <span>Arquivos de mesmo tamanho foram comparados por conteúdo e não formaram grupos idênticos.</span>
                </div>
              </div>
            )}

            <p className="section-note">
              Verificação em duas etapas: BLAKE3 parcial para reduzir leituras e hash completo para confirmar igualdade. {duplicateReport.skippedFiles} arquivos mudaram ou não puderam ser lidos e foram ignorados.
            </p>
          </>
        ) : report.duplicateCandidates.length ? (
          <>
            <div className="duplicate-list">
              {report.duplicateCandidates.slice(0, 6).map((group) => (
                <div className="duplicate-group" key={`${group.size}-${group.files[0]?.path ?? ""}`}>
                  <div className="duplicate-summary">
                    <strong>{formatBytes(group.size)}</strong>
                    <span>{group.count} arquivos · até {formatBytes(group.potentialSavings)} potencialmente repetidos</span>
                  </div>
                  <div className="duplicate-files">
                    {group.files.slice(0, 3).map((file) => (
                      <button type="button" key={file.path} onClick={() => setSelectedFile(file)} title={file.path}>
                        {file.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="section-note">A triagem rápida usa tamanho. Clique em “Confirmar por hash” para comparar conteúdo no índice inteiro deste caminho.</p>
          </>
        ) : (
          <div className="calm-empty duplicate-empty">
            <Files size={19} />
            <div>
              <strong>Nenhum candidato óbvio na triagem rápida.</strong>
              <span>A verificação completa ainda pode procurar grupos de mesmo tamanho em todo o índice.</span>
            </div>
          </div>
        )}
      </section>

      <section className="surface recommendations">
        <div className="section-heading">
          <div>
            <span className="section-kicker">REVISÃO</span>
            <h2>Itens que valem uma conferida</h2>
          </div>
          <Sparkles size={19} />
        </div>

        {report.recommendations.length ? (
          <div className="recommendation-list">
            {report.recommendations.slice(0, 10).map((item) => (
              <div className="recommendation-row" key={item.path}>
                <div className="recommendation-icon">
                  {item.risk === "Baixo" ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
                </div>
                <div className="recommendation-main">
                  <strong>{item.name}</strong>
                  <span title={item.path}>{shortPath(item.path)}</span>
                </div>
                <div className="recommendation-reason">
                  <span>{item.category}</span>
                  <small>{item.reason}</small>
                </div>
                <div className="recommendation-meta">
                  <strong>{formatBytes(item.size)}</strong>
                  <span>{formatAge(item.ageDays)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="calm-empty">
            <ShieldCheck size={19} />
            <div>
              <strong>Nada óbvio para revisar.</strong>
              <span>A L.I.V.I.A. não inventa sugestão só para preencher espaço.</span>
            </div>
          </div>
        )}
      </section>

      <footer className="app-footer">
        <ShieldCheck size={14} />
        <span>v0.2.2 · índice de sessão · somente leitura.</span>
      </footer>

      {error ? <div className="floating-error">{error}</div> : null}
    </main>
  );
}
