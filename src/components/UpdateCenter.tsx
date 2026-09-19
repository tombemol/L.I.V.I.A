import { useEffect, useState } from "react";
import { DownloadCloud, RefreshCw, ShieldCheck, X } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatBytes } from "../lib/format";

type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  releaseName: string | null;
  publishedAt: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  installerName: string | null;
  installerSize: number | null;
};

type DownloadedUpdate = {
  version: string;
  installerPath: string;
  installerName: string;
  size: number;
  sha256: string;
};

type UpdateProgress = {
  downloadedBytes: number;
  totalBytes: number;
};

function formatPublishedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function UpdateCenter() {
  const [currentVersion, setCurrentVersion] = useState("0.6.1");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [ignoredVersion, setIgnoredVersion] = useState<string | null>(() =>
    localStorage.getItem("livia-ignored-update")
  );
  const [downloaded, setDownloaded] = useState<DownloadedUpdate | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkForUpdates(showPanel = false) {
    if (checking) return;
    setChecking(true);
    setError(null);

    try {
      const result = await invoke<UpdateInfo>("check_for_update");
      setInfo(result);
      setCurrentVersion(result.currentVersion);
      const ignored = result.available && result.latestVersion === ignoredVersion;
      if (showPanel || (result.available && !ignored)) setOpen(true);
    } catch (reason) {
      if (showPanel) {
        setError(
          typeof reason === "string"
            ? reason
            : "Não foi possível consultar atualizações agora."
        );
        setOpen(true);
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;

    getVersion()
      .then((version) => {
        if (active) setCurrentVersion(version);
      })
      .catch(() => undefined);

    const timer = window.setTimeout(() => {
      if (active) void checkForUpdates(false);
    }, 1200);

    listen<UpdateProgress>("update-progress", ({ payload }) => {
      if (active) setProgress(payload);
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    });

    return () => {
      active = false;
      window.clearTimeout(timer);
      dispose?.();
    };
  }, []);

  function ignoreCurrentVersion() {
    if (!info?.available) return;
    localStorage.setItem("livia-ignored-update", info.latestVersion);
    setIgnoredVersion(info.latestVersion);
    setOpen(false);
  }

  function remindLater() {
    setOpen(false);
  }

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setDownloaded(null);
    setProgress(null);
    setError(null);

    try {
      const result = await invoke<DownloadedUpdate>("download_update");
      setDownloaded(result);
      setProgress({ downloadedBytes: result.size, totalBytes: result.size });
    } catch (reason) {
      setError(
        typeof reason === "string"
          ? reason
          : "Não foi possível baixar a atualização."
      );
    } finally {
      setDownloading(false);
    }
  }

  async function install() {
    if (!downloaded || installing) return;
    setInstalling(true);
    setError(null);

    try {
      await invoke("install_update", {
        installerPath: downloaded.installerPath,
        expectedSha256: downloaded.sha256
      });
    } catch (reason) {
      setError(
        typeof reason === "string"
          ? reason
          : "Não foi possível abrir o instalador da atualização."
      );
      setInstalling(false);
    }
  }

  const isIgnored = Boolean(
    info?.available && ignoredVersion === info.latestVersion
  );
  const releaseNotes = info?.releaseNotes?.trim() ?? "";
  const releaseNotesPreview =
    releaseNotes.length > 1400 ? `${releaseNotes.slice(0, 1400)}…` : releaseNotes;

  const total = progress?.totalBytes ?? 0;
  const percent =
    total > 0
      ? Math.min(100, Math.round(((progress?.downloadedBytes ?? 0) / total) * 100))
      : 0;

  return (
    <div className="update-center">
      <button
        className={`version-pill update-trigger${info?.available && !isIgnored ? " update-available" : ""}`}
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!info && !checking) void checkForUpdates(true);
        }}
        title="Atualizações da L.I.V.I.A."
      >
        <DownloadCloud size={13} />
        <span>v{currentVersion}</span>
        {info?.available && !isIgnored ? <i aria-label="Atualização disponível" /> : null}
      </button>

      {open ? (
        <div className="update-popover" role="dialog" aria-label="Atualizações da L.I.V.I.A.">
          <div className="update-head">
            <div>
              <span className="section-kicker">ATUALIZAÇÕES</span>
              <strong>
                {info?.available
                  ? `v${info.latestVersion} disponível`
                  : "L.I.V.I.A. Desktop"}
              </strong>
            </div>
            <button
              type="button"
              className="update-close"
              onClick={() => setOpen(false)}
              aria-label="Fechar atualizações"
            >
              <X size={14} />
            </button>
          </div>

          {checking ? (
            <div className="update-state">
              <RefreshCw size={16} className="spin" />
              <span>Consultando GitHub Releases…</span>
            </div>
          ) : null}

          {!checking && info?.available ? (
            <>
              <div className="update-version-line">
                <span>Instalada</span>
                <strong>v{info.currentVersion}</strong>
                <span>Disponível</span>
                <strong>v{info.latestVersion}</strong>
              </div>

              <p className="update-description">
                {info.releaseName ?? "Nova versão da L.I.V.I.A."}
                {formatPublishedAt(info.publishedAt)
                  ? ` · ${formatPublishedAt(info.publishedAt)}`
                  : ""}
              </p>

              {releaseNotesPreview ? (
                <div className="update-release-notes">
                  <span>NOVIDADES DA RELEASE</span>
                  <p>{releaseNotesPreview}</p>
                </div>
              ) : null}

              {isIgnored ? (
                <div className="update-ignored-note">
                  Esta versão está ignorada para avisos automáticos. Você ainda pode instalá-la manualmente.
                </div>
              ) : null}

              {info.installerSize ? (
                <div className="update-integrity">
                  <ShieldCheck size={15} />
                  <span>
                    Instalador de {formatBytes(info.installerSize)} com validação SHA-256 antes da execução.
                  </span>
                </div>
              ) : null}

              {downloading || progress ? (
                <div className="update-progress-block">
                  <div className="update-progress-copy">
                    <span>{downloading ? "Baixando atualização" : "Download validado"}</span>
                    <strong>{percent}%</strong>
                  </div>
                  <div className="update-progress-track">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  {progress?.downloadedBytes ? (
                    <small>
                      {formatBytes(progress.downloadedBytes)}
                      {progress.totalBytes ? ` de ${formatBytes(progress.totalBytes)}` : ""}
                    </small>
                  ) : null}
                </div>
              ) : null}

              {downloaded ? (
                <div className="update-ready">
                  <ShieldCheck size={15} />
                  <div>
                    <strong>Integridade confirmada</strong>
                    <span title={downloaded.sha256}>
                      SHA-256 verificado. O instalador será aberto e a L.I.V.I.A. será fechada.
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="update-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => void checkForUpdates(true)}
                  disabled={checking || downloading || installing}
                >
                  <RefreshCw size={14} />
                  Verificar novamente
                </button>

                {downloaded ? (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => void install()}
                    disabled={installing}
                  >
                    <DownloadCloud size={14} />
                    {installing ? "Abrindo…" : "Instalar atualização"}
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => void download()}
                    disabled={downloading}
                  >
                    <DownloadCloud size={14} />
                    {downloading ? "Baixando…" : "Baixar pela L.I.V.I.A."}
                  </button>
                )}
              </div>

              <div className="update-dismiss-actions">
                <button type="button" onClick={remindLater}>
                  Agora não
                </button>
                <button type="button" onClick={ignoreCurrentVersion}>
                  Ignorar v{info.latestVersion}
                </button>
              </div>
            </>
          ) : null}

          {!checking && info && !info.available ? (
            <div className="update-up-to-date">
              <ShieldCheck size={18} />
              <div>
                <strong>Você está na versão mais recente.</strong>
                <span>v{info.currentVersion} · nenhuma atualização publicada acima dela.</span>
              </div>
            </div>
          ) : null}

          {error ? <div className="update-error">{error}</div> : null}

          {!checking && !info ? (
            <button
              className="secondary-action update-check-action"
              type="button"
              onClick={() => void checkForUpdates(true)}
            >
              <RefreshCw size={14} />
              Buscar atualização
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
