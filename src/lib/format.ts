export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2
  })} ${units[index]}`;
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) {
    return `${seconds.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

export function formatAge(days: number | null): string {
  if (days === null) return "data desconhecida";
  if (days < 1) return "hoje";
  if (days === 1) return "há 1 dia";
  if (days < 30) return `há ${days} dias`;
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  }
  const years = Math.max(1, Math.floor(days / 365));
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

export function shortPath(path: string, max = 68): string {
  if (path.length <= max) return path;
  const head = Math.floor(max * 0.42);
  return `${path.slice(0, head)}…${path.slice(-(max - head - 1))}`;
}
