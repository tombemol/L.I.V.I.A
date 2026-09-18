import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Clock3, TrendingUp } from "lucide-react";
import { formatBytes } from "../lib/format";
import type { SnapshotBucket, StorageSnapshot } from "../types";

type Period = "7d" | "30d" | "all";

type Props = {
  snapshots: StorageSnapshot[];
};

type GrowthItem = SnapshotBucket & {
  delta: number;
  previousSize: number;
};

const GB = 1024 * 1024 * 1024;

function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });
}

function formatFullDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function bucketGrowth(
  current: SnapshotBucket[],
  previous: SnapshotBucket[],
  identity: (item: SnapshotBucket) => string
): GrowthItem[] {
  const before = new Map(previous.map((item) => [identity(item), item]));

  return current
    .map((item) => {
      const old = before.get(identity(item));
      return {
        ...item,
        previousSize: old?.size ?? 0,
        delta: item.size - (old?.size ?? 0)
      };
    })
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function HistoryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="history-tooltip">
      <span>{item.fullDate}</span>
      <strong>{formatBytes(item.totalSize)}</strong>
      <small>{item.fileCount.toLocaleString("pt-BR")} arquivos</small>
    </div>
  );
}

export function StorageHistory({ snapshots }: Props) {
  const [period, setPeriod] = useState<Period>("30d");

  const filtered = useMemo(() => {
    if (!snapshots.length || period === "all") return snapshots;
    const newest = snapshots[0].createdAtSecs;
    const days = period === "7d" ? 7 : 30;
    const cutoff = newest - days * 86_400;
    const selected = snapshots.filter((item) => item.createdAtSecs >= cutoff);
    return selected.length >= 2 ? selected : snapshots.slice(0, Math.min(2, snapshots.length));
  }, [period, snapshots]);

  const current = filtered[0];
  const baseline = filtered[filtered.length - 1];

  const timeline = useMemo(
    () =>
      [...filtered]
        .reverse()
        .map((item) => ({
          id: item.id,
          date: formatDate(item.createdAtSecs),
          fullDate: formatFullDate(item.createdAtSecs),
          totalSize: item.totalSize,
          sizeGb: Number((item.totalSize / GB).toFixed(2)),
          fileCount: item.fileCount
        })),
    [filtered]
  );

  const folderGrowth = useMemo(() => {
    if (!current || !baseline) return [];
    return bucketGrowth(
      current.directories ?? [],
      baseline.directories ?? [],
      (item) => item.path ?? item.label
    );
  }, [baseline, current]);

  const extensionGrowth = useMemo(() => {
    if (!current || !baseline) return [];
    return bucketGrowth(
      current.extensions ?? [],
      baseline.extensions ?? [],
      (item) => item.label
    );
  }, [baseline, current]);

  const totalDelta =
    current && baseline ? current.totalSize - baseline.totalSize : 0;
  const fileDelta =
    current && baseline ? current.fileCount - baseline.fileCount : 0;

  if (!snapshots.length) return null;

  return (
    <section className="surface storage-history">
      <div className="section-heading">
        <div>
          <span className="section-kicker">MEMÓRIA DO ARMAZENAMENTO</span>
          <h2>Histórico de espaço</h2>
        </div>
        <div className="history-periods" role="group" aria-label="Período do histórico">
          {([
            ["7d", "7 dias"],
            ["30d", "30 dias"],
            ["all", "Tudo"]
          ] as Array<[Period, string]>).map(([value, label]) => (
            <button
              type="button"
              className={period === value ? "active" : ""}
              onClick={() => setPeriod(value)}
              aria-pressed={period === value}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="history-summary-grid">
        <div className="history-stat">
          <span>VARIAÇÃO DE ESPAÇO</span>
          <strong className={totalDelta > 0 ? "growth" : totalDelta < 0 ? "shrink" : ""}>
            {totalDelta > 0 ? "+" : totalDelta < 0 ? "−" : ""}
            {formatBytes(Math.abs(totalDelta))}
          </strong>
          <small>
            {baseline
              ? "desde " + formatFullDate(baseline.createdAtSecs)
              : "sem snapshot anterior"}
          </small>
        </div>

        <div className="history-stat">
          <span>ARQUIVOS</span>
          <strong>
            {fileDelta > 0 ? "+" : ""}
            {fileDelta.toLocaleString("pt-BR")}
          </strong>
          <small>diferença no período</small>
        </div>

        <div className="history-stat">
          <span>SNAPSHOTS</span>
          <strong>{filtered.length.toLocaleString("pt-BR")}</strong>
          <small>{snapshots.length.toLocaleString("pt-BR")} armazenados no total</small>
        </div>
      </div>

      <div className="history-chart">
        {timeline.length >= 2 ? (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={timeline} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="currentColor" opacity={0.08} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                dataKey="sizeGb"
                tick={{ fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(value) => String(value) + " GB"}
              />
              <Tooltip content={<HistoryTooltip />} />
              <Line
                type="monotone"
                dataKey="sizeGb"
                stroke="currentColor"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="history-empty">
            <Clock3 size={18} />
            <span>Mais um snapshot é necessário para desenhar uma tendência.</span>
          </div>
        )}
      </div>

      <div className="growth-columns">
        <div className="growth-panel">
          <div className="growth-title">
            <TrendingUp size={14} />
            <strong>Pastas que mais mudaram</strong>
          </div>
          {folderGrowth.length ? (
            folderGrowth.slice(0, 6).map((item) => (
              <div className="growth-row" key={item.path ?? item.label}>
                {item.delta > 0 ? (
                  <ArrowUpRight size={13} />
                ) : (
                  <ArrowDownRight size={13} />
                )}
                <span title={item.path ?? item.label}>{item.label}</span>
                <strong className={item.delta > 0 ? "growth" : "shrink"}>
                  {item.delta > 0 ? "+" : "−"}
                  {formatBytes(Math.abs(item.delta))}
                </strong>
              </div>
            ))
          ) : (
            <p className="history-missing-breakdown">
              Os snapshots deste período ainda não têm detalhamento por pasta. Novas leituras da v0.5 passam a registrar isso.
            </p>
          )}
        </div>

        <div className="growth-panel">
          <div className="growth-title">
            <TrendingUp size={14} />
            <strong>Tipos que mais mudaram</strong>
          </div>
          {extensionGrowth.length ? (
            extensionGrowth.slice(0, 6).map((item) => (
              <div className="growth-row" key={item.label}>
                {item.delta > 0 ? (
                  <ArrowUpRight size={13} />
                ) : (
                  <ArrowDownRight size={13} />
                )}
                <span>{item.label}</span>
                <strong className={item.delta > 0 ? "growth" : "shrink"}>
                  {item.delta > 0 ? "+" : "−"}
                  {formatBytes(Math.abs(item.delta))}
                </strong>
              </div>
            ))
          ) : (
            <p className="history-missing-breakdown">
              O detalhamento por extensão começa nos snapshots criados pela v0.5.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
