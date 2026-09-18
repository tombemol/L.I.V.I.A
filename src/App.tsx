import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  FileArchive,
  FileSearch,
  FolderOpen,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { StorageTreemap } from "./components/StorageTreemap";
import { ExtensionList } from "./components/ExtensionList";
import { formatAge, formatBytes, formatDuration, shortPath } from "./lib/format";
import type { ScanReport } from "./types";

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
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

export default function App() {
  const [report, setReport] = useState<ScanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reclaimable = useMemo(
    () => report?.recommendations.reduce((sum, item) => sum + item.size, 0) ?? 0,
    [report]
  );

  async function chooseAndScan() {
    setError(null);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Escolha uma pasta ou unidade para analisar"
    });

    if (typeof selected !== "string") return;
    await scan(selected);
  }

  async function scan(path: string) {
    setBusy(true);
    setError(null);

    try {
      const result = await invoke<ScanReport>("scan_path", { path });
      setReport(result);
    } catch (reason) {
      setError(typeof reason === "string" ? reason : "Não foi possível analisar este caminho.");
    } finally {
      setBusy(false);
    }
  }

  if (!report) {
    return (
      <main className="empty-shell">
        <header className="brand-line">
          <div className="brand-mark" aria-hidden="true">L</div>
          <div>
            <strong>L.I.V.I.A.</strong>
            <span>Leitura Inteligente e Visualização de Armazenamento</span>
          </div>
        </header>

        <section className="start-panel">
          <div className="start-copy">
            <span className="eyebrow">ANÁLISE LOCAL · WINDOWS</span>
            <h1>Descubra exatamente o que está ocupando seu disco.</h1>
            <p>
              A L.I.V.I.A. lê metadados no seu computador, organiza o espaço por pasta e tipo
              e aponta arquivos que merecem revisão. Nesta versão, nada é excluído.
            </p>
          </div>

          <button className="primary-action" onClick={chooseAndScan} disabled={busy}>
            {busy ? <RefreshCw className="spin" size={18} /> : <FolderOpen size={18} />}
            {busy ? "Analisando…" : "Escolher pasta ou unidade"}
            {!busy ? <ArrowRight size={17} /> : null}
          </button>

          <div className="trust-note">
            <ShieldCheck size={17} />
            <span>Os dados ficam no computador. A análise não envia nomes de arquivos para a internet.</span>
          </div>

          {error ? <div className="error-banner">{error}</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-line compact">
          <div className="brand-mark" aria-hidden="true">L</div>
          <div>
            <strong>L.I.V.I.A.</strong>
            <span title={report.root}>{shortPath(report.root, 58)}</span>
          </div>
        </div>

        <button className="secondary-action" onClick={chooseAndScan} disabled={busy}>
          {busy ? <RefreshCw className="spin" size={17} /> : <FolderOpen size={17} />}
          {busy ? "Analisando…" : "Analisar outro local"}
        </button>
      </header>

      <section className="hero-summary">
        <div>
          <span className="eyebrow">ESPAÇO ANALISADO</span>
          <h1>{formatBytes(report.totalSize)}</h1>
          <p>
            {report.fileCount.toLocaleString("pt-BR")} arquivos em{" "}
            {report.folderCount.toLocaleString("pt-BR")} pastas.
          </p>
        </div>

        <div className="reclaim-copy">
          <span className="eyebrow">MERECE REVISÃO</span>
          <strong>{formatBytes(reclaimable)}</strong>
          <span>{report.recommendations.length} itens sinalizados, sem exclusão automática.</span>
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
          detail="para concluir a leitura"
        />
        <Metric
          label="IGNORADOS"
          value={report.skippedEntries.toLocaleString("pt-BR")}
          detail="sem permissão ou inacessíveis"
        />
      </section>

      <section className="analysis-grid">
        <article className="surface treemap-surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MAPA DE ESPAÇO</span>
              <h2>Onde o armazenamento está concentrado</h2>
            </div>
            <HardDrive size={20} />
          </div>
          <StorageTreemap data={report.directories} />
          <p className="section-footnote">
            O mapa agrupa o primeiro nível do caminho analisado. Quanto maior o bloco, mais espaço ele ocupa.
          </p>
        </article>

        <article className="surface extension-surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">TIPOS DE ARQUIVO</span>
              <h2>Quem mais pesa</h2>
            </div>
            <FileArchive size={20} />
          </div>
          <ExtensionList data={report.extensions} />
        </article>
      </section>

      <section className="surface recommendations">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RECOMENDAÇÕES</span>
            <h2>Arquivos que merecem uma olhada</h2>
          </div>
          <Sparkles size={20} />
        </div>

        {report.recommendations.length ? (
          <div className="recommendation-list">
            {report.recommendations.slice(0, 10).map((item) => (
              <div className="recommendation-row" key={item.path}>
                <div className="recommendation-icon">
                  {item.risk === "Baixo" ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
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
            <ShieldCheck size={20} />
            <div>
              <strong>Nada óbvio para revisar.</strong>
              <span>Isso é uma boa notícia. A L.I.V.I.A. prefere silêncio a inventar limpeza.</span>
            </div>
          </div>
        )}
      </section>

      <section className="surface file-table-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MAIORES ARQUIVOS</span>
            <h2>Os pesos-pesados deste local</h2>
          </div>
          <FileSearch size={20} />
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
              <span><Clock3 size={13} /> {formatAge(file.ageDays)}</span>
              <strong>{formatBytes(file.size)}</strong>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <ShieldCheck size={14} />
        <span>Versão 0.1: análise somente leitura. Nenhum arquivo é excluído pela aplicação.</span>
      </footer>

      {error ? <div className="floating-error">{error}</div> : null}
    </main>
  );
}
