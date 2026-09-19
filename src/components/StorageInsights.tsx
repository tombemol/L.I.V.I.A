import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Files, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { formatBytes } from "../lib/format";
import type { DuplicateReport, ScanReport, SnapshotBucket, StorageSnapshot } from "../types";

type Props = {
  report: ScanReport;
  snapshots: StorageSnapshot[];
  duplicateReport: DuplicateReport | null;
};

type Insight = {
  id: string;
  priority: "alta" | "média" | "baixa";
  title: string;
  detail: string;
  amount?: number;
  trend?: "up" | "down";
};

function findLargestGrowth(
  current: SnapshotBucket[] = [],
  previous: SnapshotBucket[] = [],
  identity: (item: SnapshotBucket) => string
) {
  const before = new Map(previous.map((item) => [identity(item), item.size]));
  return current
    .map((item) => ({
      ...item,
      delta: item.size - (before.get(identity(item)) ?? 0)
    }))
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
}

function priorityFor(bytes: number, high: number, medium: number): Insight["priority"] {
  if (bytes >= high) return "alta";
  if (bytes >= medium) return "média";
  return "baixa";
}

export function StorageInsights({ report, snapshots, duplicateReport }: Props) {
  const insights = useMemo<Insight[]>(() => {
    const next: Insight[] = [];
    const current = snapshots[0];
    const previous = snapshots[1];

    if (duplicateReport?.reclaimableBytes) {
      next.push({
        id: "duplicates",
        priority: priorityFor(duplicateReport.reclaimableBytes, 5 * 1024 ** 3, 1024 ** 3),
        title: "Duplicatas confirmadas",
        detail: `${duplicateReport.groups.length} grupo(s) tiveram conteúdo confirmado por hash completo. Espaço recuperável sem apagar a cópia preservada.`,
        amount: duplicateReport.reclaimableBytes
      });
    }

    const reviewBytes = report.recommendations.reduce((sum, item) => sum + item.size, 0);
    if (reviewBytes > 0) {
      next.push({
        id: "review",
        priority: priorityFor(reviewBytes, 8 * 1024 ** 3, 2 * 1024 ** 3),
        title: "Fila de revisão",
        detail: `${report.recommendations.length} item(ns) foram sinalizados por tamanho, idade e contexto. A L.I.V.I.A. só recomenda revisão, nunca remoção automática.`,
        amount: reviewBytes
      });
    }

    if (current && previous) {
      const totalDelta = current.totalSize - previous.totalSize;
      if (totalDelta !== 0) {
        next.push({
          id: "total-growth",
          priority:
            totalDelta > 0
              ? priorityFor(totalDelta, 10 * 1024 ** 3, 2 * 1024 ** 3)
              : "baixa",
          title: totalDelta > 0 ? "Armazenamento cresceu" : "Armazenamento encolheu",
          detail:
            totalDelta > 0
              ? "O último snapshot ocupa mais espaço que o anterior. Vale olhar quem puxou esse crescimento antes que o C: vire patrimônio histórico."
              : "O último snapshot registrou redução de espaço. Milagre estatístico raro, porém documentado.",
          amount: Math.abs(totalDelta),
          trend: totalDelta > 0 ? "up" : "down"
        });
      }

      const folder = findLargestGrowth(
        current.directories,
        previous.directories,
        (item) => item.path ?? item.label
      );
      if (folder && folder.delta > 0) {
        next.push({
          id: `folder:${folder.path ?? folder.label}`,
          priority: priorityFor(folder.delta, 6 * 1024 ** 3, 1024 ** 3),
          title: `Pasta em crescimento: ${folder.label}`,
          detail: folder.path
            ? `Foi a maior variação positiva entre os dois snapshots mais recentes. ${folder.path}`
            : "Foi a maior variação positiva entre os dois snapshots mais recentes.",
          amount: folder.delta,
          trend: "up"
        });
      }

      const extension = findLargestGrowth(
        current.extensions,
        previous.extensions,
        (item) => item.label
      );
      if (extension && extension.delta > 0) {
        next.push({
          id: `extension:${extension.label}`,
          priority: priorityFor(extension.delta, 4 * 1024 ** 3, 512 * 1024 ** 2),
          title: `Tipo em crescimento: ${extension.label}`,
          detail: "Esse tipo de arquivo foi o que mais cresceu entre os dois snapshots mais recentes.",
          amount: extension.delta,
          trend: "up"
        });
      }
    }

    if (!next.length) {
      next.push({
        id: "quiet",
        priority: "baixa",
        title: "Nada urgente apareceu",
        detail: "Sem crescimento relevante, duplicatas confirmadas ou uma fila grande de revisão. Às vezes o computador simplesmente se comporta. Perturbador."
      });
    }

    const weight = { alta: 3, média: 2, baixa: 1 };
    return next
      .sort((a, b) => weight[b.priority] - weight[a.priority] || (b.amount ?? 0) - (a.amount ?? 0))
      .slice(0, 5);
  }, [duplicateReport, report.recommendations, snapshots]);

  return (
    <section className="surface storage-insights">
      <div className="section-heading">
        <div>
          <span className="section-kicker">LEITURA INTELIGENTE</span>
          <h2>O que merece atenção agora</h2>
        </div>
        <Sparkles size={19} />
      </div>

      <div className="insight-list">
        {insights.map((item, index) => (
          <article className={`insight-row priority-${item.priority}`} key={item.id}>
            <div className="insight-rank">{String(index + 1).padStart(2, "0")}</div>
            <div className="insight-icon">
              {item.id === "duplicates" ? (
                <Files size={16} />
              ) : item.trend === "up" ? (
                <ArrowUpRight size={16} />
              ) : item.trend === "down" ? (
                <ArrowDownRight size={16} />
              ) : item.priority === "baixa" ? (
                <ShieldCheck size={16} />
              ) : (
                <TrendingUp size={16} />
              )}
            </div>
            <div className="insight-main">
              <div className="insight-title-line">
                <strong>{item.title}</strong>
                <span className="insight-priority">{item.priority}</span>
              </div>
              <p>{item.detail}</p>
            </div>
            {typeof item.amount === "number" ? (
              <strong className="insight-amount">{formatBytes(item.amount)}</strong>
            ) : null}
          </article>
        ))}
      </div>

      <p className="section-note">
        Prioridades são calculadas localmente a partir do índice, snapshots e hashes já existentes. Nenhum arquivo é removido por esta análise.
      </p>
    </section>
  );
}
