import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, Trash2, X } from "lucide-react";
import { formatBytes, shortPath } from "../lib/format";
import type { CleanupHistoryEntry, FileEntry } from "../types";

type Props = {
  files: FileEntry[];
  busy: boolean;
  history: CleanupHistoryEntry[];
  onRemove: (path: string) => void;
  onClear: () => void;
  onTrash: () => Promise<void>;
};

export function CleanupTray({
  files,
  busy,
  history,
  onRemove,
  onClear,
  onTrash
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );

  if (!files.length && !history.length) return null;

  async function handleTrash() {
    if (!confirming) {
      setConfirming(true);
      setExpanded(true);
      return;
    }

    await onTrash();
    setConfirming(false);
    setExpanded(false);
  }

  return (
    <aside className={`cleanup-tray${expanded ? " expanded" : ""}`}>
      <div className="cleanup-tray-head">
        <button
          className="cleanup-tray-summary"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          <Trash2 size={16} />
          <span>
            <strong>Limpeza assistida</strong>
            <small>
              {files.length
                ? `${files.length} arquivo${files.length === 1 ? "" : "s"} · ${formatBytes(totalBytes)}`
                : "Nenhum arquivo selecionado"}
            </small>
          </span>
        </button>

        {expanded ? (
          <button
            className="cleanup-icon-button"
            type="button"
            onClick={() => {
              setExpanded(false);
              setConfirming(false);
            }}
            aria-label="Fechar limpeza assistida"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="cleanup-tray-body">
          {files.length ? (
            <>
              <div className="cleanup-selection">
                {files.slice(0, 12).map((file) => (
                  <div className="cleanup-item" key={file.path}>
                    <div>
                      <strong>{file.name}</strong>
                      <span title={file.path}>{shortPath(file.path, 54)}</span>
                    </div>
                    <small>{formatBytes(file.size)}</small>
                    <button
                      type="button"
                      onClick={() => onRemove(file.path)}
                      aria-label={`Remover ${file.name} da seleção`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {files.length > 12 ? (
                  <div className="cleanup-more">
                    + {files.length - 12} arquivos na seleção
                  </div>
                ) : null}
              </div>

              <div className={`cleanup-warning${confirming ? " active" : ""}`}>
                <AlertTriangle size={16} />
                <div>
                  <strong>
                    {confirming
                      ? "Confirme o envio para a Lixeira"
                      : "Nada é apagado diretamente"}
                  </strong>
                  <span>
                    {confirming
                      ? "A L.I.V.I.A. vai validar cada arquivo de novo e mover somente os que continuam iguais ao índice. Arquivos do Windows são bloqueados."
                      : "Os arquivos selecionados serão enviados para a Lixeira do sistema. O conteúdo não é excluído de forma permanente por este fluxo."}
                  </span>
                </div>
              </div>

              <div className="cleanup-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => {
                    onClear();
                    setConfirming(false);
                  }}
                  disabled={busy}
                >
                  Limpar seleção
                </button>
                <button
                  className={`cleanup-confirm-action${confirming ? " armed" : ""}`}
                  type="button"
                  onClick={handleTrash}
                  disabled={busy}
                >
                  {confirming ? <Check size={15} /> : <Trash2 size={15} />}
                  {busy
                    ? "Movendo…"
                    : confirming
                      ? `Confirmar ${formatBytes(totalBytes)}`
                      : "Mover para a Lixeira"}
                </button>
              </div>
            </>
          ) : null}

          {history.length ? (
            <div className="cleanup-history">
              <span className="section-kicker">HISTÓRICO LOCAL</span>
              {history.slice(0, 5).map((entry) => (
                <div className="cleanup-history-row" key={entry.id}>
                  <Clock3 size={12} />
                  <span>
                    {new Date(entry.timestamp).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                  <strong>
                    {entry.movedFiles} arquivo{entry.movedFiles === 1 ? "" : "s"} · {formatBytes(entry.movedBytes)}
                  </strong>
                  {entry.failedFiles ? <small>{entry.failedFiles} preservado(s)</small> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
