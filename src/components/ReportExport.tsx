import { useState } from "react";
import { FileDown, FileJson, Table2, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { DuplicateReport, ScanReport, StorageSnapshot } from "../types";

type ExportFormat = "json" | "csv";

type ReportExportProps = {
  report: ScanReport;
  snapshots: StorageSnapshot[];
  duplicateReport: DuplicateReport | null;
};

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(
  report: ScanReport,
  snapshots: StorageSnapshot[],
  duplicateReport: DuplicateReport | null
) {
  const rows: Array<Array<string | number | null | undefined>> = [
    ["secao", "nome", "caminho", "tamanho_bytes", "quantidade", "detalhe"],
    ["resumo", "raiz", report.root, report.totalSize, report.fileCount, report.engine.label],
    ["resumo", "pastas", report.root, null, report.folderCount, "pastas encontradas"],
    ["resumo", "ignorados", report.root, null, report.skippedEntries, "entradas inacessíveis"],
    ["resumo", "arquivos_indexados", report.indexRoot, null, report.indexedFiles, "índice ativo"]
  ];

  for (const item of report.directories) {
    rows.push(["pasta", item.name, item.path, item.size, item.fileCount, null]);
  }

  for (const item of report.extensions) {
    rows.push(["extensao", item.extension, null, item.size, item.count, null]);
  }

  for (const item of report.largestFiles) {
    rows.push([
      "arquivo_grande",
      item.name,
      item.path,
      item.size,
      null,
      item.ageDays == null ? null : `${item.ageDays} dias`
    ]);
  }

  for (const item of report.recommendations) {
    rows.push([
      "recomendacao",
      item.name,
      item.path,
      item.size,
      null,
      `${item.category} · ${item.risk} · ${item.reason}`
    ]);
  }

  for (const snapshot of snapshots) {
    rows.push([
      "snapshot",
      new Date(snapshot.createdAtSecs * 1000).toISOString(),
      snapshot.root,
      snapshot.totalSize,
      snapshot.fileCount,
      snapshot.engineLabel
    ]);
  }

  for (const group of duplicateReport?.groups ?? []) {
    rows.push([
      "duplicata",
      group.hash,
      null,
      group.reclaimableBytes,
      group.count,
      `${group.size} bytes por arquivo`
    ]);
  }

  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function buildJson(
  report: ScanReport,
  snapshots: StorageSnapshot[],
  duplicateReport: DuplicateReport | null
) {
  return JSON.stringify(
    {
      schema: "livia-report-v1",
      generatedAt: new Date().toISOString(),
      report,
      snapshots,
      duplicates: duplicateReport
    },
    null,
    2
  );
}

function defaultName(report: ScanReport, format: ExportFormat) {
  const root = report.indexRoot
    .replaceAll("\\", "-")
    .replaceAll("/", "-")
    .replaceAll(":", "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "armazenamento";
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  return `LIVIA-${root}-${stamp}.${format}`;
}

export function ReportExport({
  report,
  snapshots,
  duplicateReport
}: ReportExportProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function exportReport(format: ExportFormat) {
    if (busy) return;

    setBusy(format);
    setStatus(null);

    try {
      const path = await save({
        title: format === "json" ? "Exportar relatório completo" : "Exportar resumo em CSV",
        defaultPath: defaultName(report, format),
        filters: [
          {
            name: format === "json" ? "Relatório JSON" : "Planilha CSV",
            extensions: [format]
          }
        ]
      });

      if (!path) return;

      const content =
        format === "json"
          ? buildJson(report, snapshots, duplicateReport)
          : buildCsv(report, snapshots, duplicateReport);

      await invoke("save_report_file", { path, content });
      setStatus(
        format === "json"
          ? "Relatório completo exportado."
          : "Resumo CSV exportado."
      );
    } catch (reason) {
      setStatus(
        typeof reason === "string"
          ? reason
          : "Não foi possível exportar o relatório."
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="report-export">
      <button
        className="secondary-action"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <FileDown size={15} />
        Exportar
      </button>

      {open ? (
        <div className="report-export-popover" role="dialog" aria-label="Exportar relatório">
          <div className="report-export-head">
            <div>
              <span className="section-kicker">EXPORTAÇÃO</span>
              <strong>Leve a análise com você</strong>
            </div>
            <button
              type="button"
              className="update-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar exportação"
            >
              <X size={14} />
            </button>
          </div>

          <button
            className="report-export-option"
            type="button"
            onClick={() => void exportReport("json")}
            disabled={Boolean(busy)}
          >
            <FileJson size={17} />
            <span>
              <strong>JSON completo</strong>
              <small>Relatório, snapshots e duplicatas confirmadas da sessão.</small>
            </span>
            <b>{busy === "json" ? "Salvando…" : ".json"}</b>
          </button>

          <button
            className="report-export-option"
            type="button"
            onClick={() => void exportReport("csv")}
            disabled={Boolean(busy)}
          >
            <Table2 size={17} />
            <span>
              <strong>CSV para planilha</strong>
              <small>Resumo legível por Excel e similares, separado por ponto e vírgula.</small>
            </span>
            <b>{busy === "csv" ? "Salvando…" : ".csv"}</b>
          </button>

          <p className="report-export-note">
            Nada é enviado para a internet. O arquivo é gravado apenas no local que você escolher.
          </p>

          {status ? <div className="report-export-status">{status}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
