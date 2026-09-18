import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import type { DirectorySummary } from "../types";
import { formatBytes } from "../lib/format";

type Props = {
  data: DirectorySummary[];
};

type TreemapNode = {
  depth?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  index?: number;
};

type TooltipContentProps = {
  active?: boolean;
  payload?: Array<{
    payload?: {
      name?: string;
      size?: number;
      files?: number;
    };
  }>;
};

function Cell({
  depth,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = "",
  index = 0
}: TreemapNode) {
  if (depth !== 1) return null;

  const palette = [
    "var(--treemap-1)",
    "var(--treemap-2)",
    "var(--treemap-3)",
    "var(--treemap-4)",
    "var(--treemap-5)",
    "var(--treemap-6)"
  ];
  const fill = palette[index % palette.length];
  const showLabel = width > 92 && height > 44;

  return (
    <g className="treemap-cell">
      <rect
        x={x}
        y={y}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={6}
        fill={fill}
      />
      {showLabel ? (
        <text x={x + 10} y={y + 20} fill="var(--treemap-label)" fontSize={12} fontWeight={650}>
          {name.length > 22 ? `${name.slice(0, 20)}…` : name}
        </text>
      ) : null}
    </g>
  );
}

function TreemapTooltip({ active, payload }: TooltipContentProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="treemap-tooltip">
      <strong>{item.name ?? "Pasta"}</strong>
      <span>{formatBytes(Number(item.size ?? 0))}</span>
      <small>{Number(item.files ?? 0).toLocaleString("pt-BR")} arquivos</small>
    </div>
  );
}

export function StorageTreemap({ data }: Props) {
  const chartData = data.slice(0, 14).map((item, index) => ({
    name: item.name,
    size: item.size,
    files: item.fileCount,
    index
  }));

  if (!chartData.length) {
    return <div className="empty-chart">Nenhum diretório encontrado.</div>;
  }

  return (
    <div className="treemap-wrap" aria-label="Mapa visual do espaço ocupado">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={chartData}
          dataKey="size"
          nameKey="name"
          content={<Cell />}
          aspectRatio={16 / 8}
          isAnimationActive={false}
        >
          <Tooltip cursor={false} content={<TreemapTooltip />} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
