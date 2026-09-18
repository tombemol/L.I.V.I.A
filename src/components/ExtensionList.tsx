import type { ExtensionSummary } from "../types";
import { formatBytes } from "../lib/format";

export function ExtensionList({ data }: { data: ExtensionSummary[] }) {
  const max = data[0]?.size ?? 1;

  return (
    <div className="extension-list">
      {data.slice(0, 9).map((item) => {
        const width = Math.max(2, (item.size / max) * 100);
        return (
          <div className="extension-row" key={item.extension}>
            <div className="extension-copy">
              <span className="extension-name">{item.extension}</span>
              <span>{item.count.toLocaleString("pt-BR")} arquivos</span>
            </div>
            <div className="extension-value">{formatBytes(item.size)}</div>
            <div className="extension-track" aria-hidden="true">
              <span style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
