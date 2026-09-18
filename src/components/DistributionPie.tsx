import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBytes } from "../lib/format";

export type DistributionPieItem = {
  label: string;
  value: number;
  detail: string;
  path?: string;
};

type Props = {
  data: DistributionPieItem[];
  ariaLabel: string;
  compact?: boolean;
  maxSlices?: number;
  onSelect?: (item: DistributionPieItem) => void;
};

type Slice = DistributionPieItem & {
  color: string;
  aggregate?: boolean;
};

type TooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: Slice;
  }>;
};

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)"
];

function buildSlices(data: DistributionPieItem[], maxSlices: number): Slice[] {
  const sorted = data
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const visibleCount = Math.max(3, maxSlices);
  const hasRemainder = sorted.length > visibleCount;
  const head = hasRemainder ? sorted.slice(0, visibleCount - 1) : sorted.slice(0, visibleCount);
  const tail = hasRemainder ? sorted.slice(visibleCount - 1) : [];

  const slices: Omit<Slice, "color">[] = head.map((item) => ({ ...item }));

  if (tail.length) {
    slices.push({
      label: "Outros",
      value: tail.reduce((sum, item) => sum + item.value, 0),
      detail: `${tail.length.toLocaleString("pt-BR")} categorias agrupadas`,
      aggregate: true
    });
  }

  return slices.map((item, index) => ({
    ...item,
    color: palette[index % palette.length]
  }));
}

function PieTooltip({ active, payload }: TooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="pie-tooltip">
      <span className="pie-tooltip-dot" style={{ background: item.color }} />
      <div>
        <strong>{item.label}</strong>
        <span>{formatBytes(item.value)}</span>
        <small>{item.detail}</small>
      </div>
    </div>
  );
}

export function DistributionPie({
  data,
  ariaLabel,
  compact = false,
  maxSlices = 8,
  onSelect
}: Props) {
  const slices = buildSlices(data, maxSlices);
  const total = slices.reduce((sum, item) => sum + item.value, 0);

  if (!slices.length || total <= 0) {
    return <div className="empty-chart">Nenhum dado disponível para o gráfico.</div>;
  }

  return (
    <div className={`distribution-pie${compact ? " compact" : ""}`} aria-label={ariaLabel}>
      <div className="pie-chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="50%"
              outerRadius="82%"
              paddingAngle={1.4}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((item) => (
                <Cell
                  key={`${item.label}-${item.value}`}
                  fill={item.color}
                  className={onSelect && item.path && !item.aggregate ? "pie-slice clickable" : "pie-slice"}
                  onClick={() => {
                    if (onSelect && item.path && !item.aggregate) onSelect(item);
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pie-center" aria-hidden="true">
          <span>TOTAL</span>
          <strong>{formatBytes(total)}</strong>
        </div>
      </div>

      <div className="pie-legend">
        {slices.map((item) => {
          const percent = total ? (item.value / total) * 100 : 0;
          const content = (
            <>
              <span className="pie-legend-dot" style={{ background: item.color }} />
              <span className="pie-legend-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <span className="pie-legend-value">
                <strong>{percent >= 10 ? percent.toFixed(0) : percent.toFixed(1)}%</strong>
                <small>{formatBytes(item.value)}</small>
              </span>
            </>
          );

          if (onSelect && item.path && !item.aggregate) {
            return (
              <button
                className="pie-legend-row clickable"
                type="button"
                key={`${item.label}-${item.value}`}
                onClick={() => onSelect(item)}
                title={item.path}
              >
                {content}
              </button>
            );
          }

          return (
            <div className="pie-legend-row" key={`${item.label}-${item.value}`}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
