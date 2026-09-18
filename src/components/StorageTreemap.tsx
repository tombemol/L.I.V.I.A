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

function Cell({ depth, x = 0, y = 0, width = 0, height = 0, name = "", index = 0 }: TreemapNode) {
  if (depth !== 1) return null;
  const palette = ["#2f93aa", "#347f98", "#396f87", "#3d6277", "#41586a", "#44505f"];
  const fill = palette[index % palette.length];
  const showLabel = width > 92 && height > 44;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={4}
        fill={fill}
      />
      {showLabel ? (
        <text x={x + 10} y={y + 20} fill="#f4f7f8" fontSize={12} fontWeight={650}>
          {name.length > 22 ? `${name.slice(0, 20)}…` : name}
        </text>
      ) : null}
    </g>
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
          <Tooltip
            cursor={false}
            contentStyle={{
              background: "#10151b",
              border: "1px solid #28323d",
              borderRadius: 6,
              color: "#f4f7f8"
            }}
            formatter={(value) => [formatBytes(Number(value ?? 0)), "Espaço"]}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
