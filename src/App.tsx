import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Clock3,
  FileArchive,
  FileSearch,
  FolderOpen,
  HardDrive,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  X
} from "lucide-react";
import { StorageTreemap } from "./components/StorageTreemap";
import { ExtensionList } from "./components/ExtensionList";
import { formatAge, formatBytes, formatDuration, shortPath } from "./lib/format";
import type { ScanProgress, ScanReport } from "./types";

function LogoGlyph() {
  return (
    <div className="logo-glyph" aria-hidden="true">
      <span className="logo-l-v" />
      <span className="logo-l-h" />
      <span className="logo-cell logo-cell-a" />
      <span className="logo-cell logo-cell-b" />
      <span className="logo-cell logo-cell-c" />
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

function ThemeToggle({
  theme,
  onToggle
}: {
  theme: Theme;
  onToggle: () => void;
}) {
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

function Metric({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}

export default function App() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [systemDrive, setSystemDrive] = useState("C:\\");
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

  const reclaimable = useMemo(
    () => report?.recommendations.reduce((sum, item) => sum + item.size, 0) ?? 0,
    [report]
  );

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  async function chooseAndScan() {
    setError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Escolha uma pasta ou unidade para analisar"
    });

    if (typeof selected === "string") {
      await scan(selected);
    }
  }

  async function scan(path: string) {
    if (busy) return;

    setBusy(true);
    setCancelRequested(false);
    setError(null);
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

  async function cancelScan() {
    setCancelRequested(true);
    try {
      await invoke("cancel_scan");
    } catch {
      setCancelRequested(false);
    }
  }

  if (busy) {
    return (
      <main className="utility-shell">
        <header className="topbar">
          <Brand detail="Análise em andamento" />
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <span className="version-pill">v0.1.2</span>
          </div>
        </header>

        <section className="scan-stage">
          <div className="scan-heading">
            <span className="section-kicker">VARREDURA LOCAL</span>
            <h1>Analisando {shortPath(progress?.root ?? "", 52)}</h1>
            <p>
              A análise roda fora da interface. Você pode acompanhar o trabalho ou cancelar sem
              travar a janela.
            </p>
          </div>

          <div className="scan-progress" aria-label="Análise em andamento">
            <span />
          </div>

          <div className="scan-metrics">
            <Metric
              label="ARQUIVOS"
              value={(progress?.filesScanned ?? 0).toLocaleString("pt-BR")}
              detail="lidos até agora"
            />
            <Metric
              label="PASTAS"
              value={(progress?.foldersScanned ?? 0).toLocaleString("pt-BR")}
              detail="percorridas"
            />
            <Metric
              label="DADOS"
              value={formatBytes(progress?.bytesScanned ?? 0)}
              detail="contabilizados"
            />
            <Metric
              label="TEMPO"
              value={formatDuration(progress?.elapsedMs ?? 0)}
              detail="decorrido"
            />
          </div>

          <div className="current-path">
            <span>Agora</span>
            <code title={progress?.currentPath}>
              {shortPath(progress?.currentPath ?? progress?.root ?? "", 96)}
            </code>
          </div>

          <div className="scan-actions">
            <div className="scan-note">
              <ShieldCheck size={15} />
              <span>
                Somente metadados são lidos. {progress?.skippedEntries ?? 0} entradas inacessíveis
                foram ignoradas.
              </span>
            </div>
            <button
              className="danger-action"
              type="button"
              onClick={cancelScan}
              disabled={cancelRequested}
            >
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
            <span className="version-pill">v0.1.2</span>
          </div>
        </header>

        <section className="start-stage">
          <div className="start-heading">
            <span className="section-kicker">ANÁLISE LOCAL · WINDOWS</span>
            <h1>Analisar armazenamento</h1>
            <p>
              Escolha uma unidade ou pasta. A L.I.V.I.A. mostra onde o espaço está sendo usado e
              quais arquivos merecem revisão, sem excluir nada.
            </p>
          </div>

          <div className="target-list">
            <div className="target-row">
              <div className="target-icon">
                <HardDrive size={20} />
              </div>
              <div className="target-copy">
                <strong>Disco do sistema</strong>
                <span>{systemDrive} · análise completa da unidade</span>
              </div>
              <button className="primary-action" type="button" onClick={() => scan(systemDrive)}>
                Analisar
              </button>
            </div>

            <div className="target-row">
              <div className="target-icon">
                <FolderOpen size={20} />
              </div>
              <div className="target-copy">
                <strong>Outra pasta ou unidade</strong>
                <span>Escolha um local específico pelo seletor do Windows</span>
              </div>
              <button className="secondary-action" type="button" onClick={chooseAndScan}>
                Escolher
              </button>
            </div>
          </div>

          <div className="privacy-line">
            <ShieldCheck size={16} />
            <div>
              <strong>Somente leitura</strong>
              <span>Os nomes e metadados analisados permanecem no computador.</span>
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
          <button className="secondary-action" type="button" onClick={() => scan(report.root)}>
            <RefreshCw size={15} />
            Reanalisar
          </button>
          <button className="primary-action compact" type="button" onClick={chooseAndScan}>
            <FolderOpen size={15} />
            Novo local
          </button>
        </div>
      </header>

      <section className="report-summary">
        <div className="report-title">
          <span className="section-kicker">RESULTADO DA ANÁLISE</span>
          <h1 title={report.root}>{shortPath(report.root, 76)}</h1>
          <p>
            {formatBytes(report.totalSize)} encontrados em{" "}
            {report.fileCount.toLocaleString("pt-BR")} arquivos.
          </p>
        </div>

        <div className="review-summary">
          <span className="metric-label">MERECE REVISÃO</span>
          <strong>{formatBytes(reclaimable)}</strong>
          <span>{report.recommendations.length} itens sinalizados</span>
        </div>
      </section>

      <section className="metrics-strip">
        <Metric
          label="ARQUIVOS"
          value={report.fileCount.toLocaleString("pt-BR")}
          detail="itens contabilizados"
        />
        <Metric
          label="PASTAS"
          value={report.folderCount.toLocaleString("pt-BR")}
          detail="diretórios percorridos"
        />
        <Metric
          label="TEMPO"
          value={formatDuration(report.durationMs)}
          detail="para concluir"
        />
        <Metric
          label="IGNORADOS"
          value={report.skippedEntries.toLocaleString("pt-BR")}
          detail="sem acesso"
        />
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
          <StorageTreemap data={report.directories} />
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
                  {item.risk === "Baixo" ? (
                    <ShieldCheck size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
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

      <section className="surface file-table-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">MAIORES ARQUIVOS</span>
            <h2>Arquivos que mais ocupam espaço</h2>
          </div>
          <FileSearch size={19} />
        </div>

        <div className="file-table" role="table" aria-label="Maiores arquivos">
          <div className="file-row file-head" role="row">
            <span>Arquivo</span>
            <span>Tipo</span>
            <span>Modificado</span>
            <span>Tamanho</span>
          </div>
          {report.largestFiles.slice(0, 15).map((file) => (
            <div className="file-row" role="row" key={file.path}>
              <span className="file-name-cell">
                <strong>{file.name}</strong>
                <small title={file.path}>{shortPath(file.path, 72)}</small>
              </span>
              <span>{file.extension}</span>
              <span>
                <Clock3 size={13} /> {formatAge(file.ageDays)}
              </span>
              <strong>{formatBytes(file.size)}</strong>
            </div>
          ))}
        </div>
      </section>

      <footer className="app-footer">
        <ShieldCheck size={14} />
        <span>v0.1.2 · somente leitura · nenhum arquivo é excluído.</span>
      </footer>

      {error ? <div className="floating-error">{error}</div> : null}
    </main>
  );
}
