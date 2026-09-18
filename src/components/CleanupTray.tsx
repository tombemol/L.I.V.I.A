import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, RotateCcw, Trash2, X } from "lucide-react";
import { formatBytes, shortPath } from "../lib/format";
import type { CleanupHistoryEntry, FileEntry } from "../types";

type Props = {
  files: FileEntry[];
  busy: boolean;
  history: CleanupHistoryEntry[];
  restoreBusyOperation: string | null;
  onRemove: (path: string) => void;
  onClear: () => void;
  onTrash: () => Promise<void>;
  onRestore: (operationId: string) => Promise<void>;
};

export function CleanupTray({
  files,
  busy,
  history,
  restoreBusyOperation,
  onRemove,
  onClear,
  onTrash,
  onRestore
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
                : history.some((entry) => entry.operationId && (entry.undoableFiles ?? 0) > 0)
                  ? "Há uma limpeza que ainda pode ser desfeita"
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
                      ? "A L.I.V.I.A. valida os arquivos novamente, tenta registrar a entrada exata da Lixeira para permitir desfazer e preserva tudo que mudou desde o índice."
                      : "Os arquivos selecionados vão para a Lixeira. Quando a entrada puder ser identificada com segurança, o histórico desta sessão oferece Desfazer."}
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
                    ? "Processando…"
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
              {history.slice(0, 6).map((entry) => {
                const undoable = entry.undoableFiles ?? 0;
                const restored = entry.restoredFiles ?? 0;
                const restoring = Boolean(
                  entry.operationId && restoreBusyOperation === entry.operationId
                );

                return (
                  <div className="cleanup-history-row" key={entry.id}>
                    <Clock3 size={12} />
                    <div className="cleanup-history-copy">
                      <span>
                        {new Date(entry.timestamp).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                      <strong>
                        {entry.movedFiles} movido{entry.movedFiles === 1 ? "" : "s"} · {formatBytes(entry.movedBytes)}
                      </strong>
                      <small>
                        {restored
                          ? `${restored} restaurado${restored === 1 ? "" : "s"} · ${formatBytes(entry.restoredBytes ?? 0)}`
                          : entry.failedFiles
                            ? `${entry.failedFiles} preservado(s) durante a limpeza`
                            : undoable
                              ? `${undoable} disponível(is) para desfazer nesta sessão`
                              : "operação concluída"}
                      </small>
                    </div>

                    <div className="cleanup-history-actions">
                      {entry.operationId && undoable > 0 ? (
                        <button
                          className="cleanup-undo-button"
                          type="button"
                          onClick={() => onRestore(entry.operationId as string)}
                          disabled={busy}
                        >
                          <RotateCcw size={12} />
                          {restoring ? "Restaurando…" : `Desfazer ${undoable}`}
                        </button>
                      ) : restored ? (
                        <span className="cleanup-restored-badge">
                          <Check size={11} /> restaurado
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <p className="cleanup-history-note">
                O botão Desfazer é propositalmente ligado à sessão atual. O histórico persistente guarda só totais, não caminhos nem identificadores da Lixeira.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
