use reqwest::header::USER_AGENT;
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Emitter};

const RELEASES_URL: &str = "https://api.github.com/repos/tombemol/L.I.V.I.A/releases?per_page=20";
const USER_AGENT_VALUE: &str = "L.I.V.I.A.-desktop-updater";

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    draft: bool,
    published_at: Option<String>,
    html_url: String,
    body: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone)]
struct ReleaseCandidate {
    version: Version,
    release: GithubRelease,
    installer: GithubAsset,
    checksum: GithubAsset,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    latest_version: String,
    available: bool,
    release_name: Option<String>,
    published_at: Option<String>,
    release_url: Option<String>,
    release_notes: Option<String>,
    installer_name: Option<String>,
    installer_size: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedUpdate {
    version: String,
    installer_path: String,
    installer_name: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded_bytes: u64,
    total_bytes: u64,
}

fn current_version() -> Result<Version, String> {
    Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|error| format!("A versão atual da L.I.V.I.A. é inválida: {error}"))
}

fn parse_release_version(tag: &str) -> Option<Version> {
    Version::parse(tag.trim().trim_start_matches('v')).ok()
}

fn installer_asset(release: &GithubRelease) -> Option<GithubAsset> {
    release
        .assets
        .iter()
        .find(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.ends_with(".exe") && name.contains("setup")
        })
        .cloned()
}

fn checksum_asset(release: &GithubRelease, installer_name: &str) -> Option<GithubAsset> {
    let exact = format!("{installer_name}.sha256");
    release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(&exact))
        .cloned()
}

fn checksum_from_text(value: &str) -> Option<String> {
    let hash = value.split_whitespace().next()?.trim().to_ascii_lowercase();
    if hash.len() == 64 && hash.chars().all(|value| value.is_ascii_hexdigit()) {
        Some(hash)
    } else {
        None
    }
}

async fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT_VALUE)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|error| format!("Não foi possível preparar a consulta de atualização: {error}"))
}

async fn fetch_releases() -> Result<Vec<GithubRelease>, String> {
    let response = client()
        .await?
        .get(RELEASES_URL)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .send()
        .await
        .map_err(|error| format!("Não foi possível consultar o GitHub Releases: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "O GitHub respondeu {} ao consultar atualizações.",
            response.status()
        ));
    }

    response
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| format!("A resposta de atualização não pôde ser interpretada: {error}"))
}

async fn latest_candidate() -> Result<Option<ReleaseCandidate>, String> {
    let current = current_version()?;
    let releases = fetch_releases().await?;
    let mut candidates = Vec::new();

    for release in releases {
        if release.draft {
            continue;
        }

        let Some(version) = parse_release_version(&release.tag_name) else {
            continue;
        };

        if version <= current {
            continue;
        }

        let Some(installer) = installer_asset(&release) else {
            continue;
        };

        let Some(checksum) = checksum_asset(&release, &installer.name) else {
            continue;
        };

        candidates.push(ReleaseCandidate {
            version,
            release,
            installer,
            checksum,
        });
    }

    candidates.sort_by(|left, right| right.version.cmp(&left.version));
    Ok(candidates.into_iter().next())
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let current = current_version()?;

    match latest_candidate().await? {
        Some(candidate) => Ok(UpdateInfo {
            current_version: current.to_string(),
            latest_version: candidate.version.to_string(),
            available: true,
            release_name: candidate.release.name,
            published_at: candidate.release.published_at,
            release_url: Some(candidate.release.html_url),
            release_notes: candidate.release.body,
            installer_name: Some(candidate.installer.name),
            installer_size: Some(candidate.installer.size),
        }),
        None => Ok(UpdateInfo {
            current_version: current.to_string(),
            latest_version: current.to_string(),
            available: false,
            release_name: None,
            published_at: None,
            release_url: None,
            release_notes: None,
            installer_name: None,
            installer_size: None,
        }),
    }
}

fn update_download_path(version: &Version, installer_name: &str) -> PathBuf {
    let safe_name = Path::new(installer_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("L.I.V.I.A-update.exe");

    std::env::temp_dir()
        .join("L.I.V.I.A")
        .join("updates")
        .join(version.to_string())
        .join(safe_name)
}

#[tauri::command]
pub async fn download_update(app: AppHandle) -> Result<DownloadedUpdate, String> {
    let candidate = latest_candidate()
        .await?
        .ok_or_else(|| "Nenhuma atualização mais recente está disponível.".to_string())?;

    let http = client().await?;

    let checksum_text = http
        .get(&candidate.checksum.browser_download_url)
        .send()
        .await
        .map_err(|error| format!("Não foi possível baixar o checksum da atualização: {error}"))?
        .error_for_status()
        .map_err(|error| format!("O checksum da atualização não está disponível: {error}"))?
        .text()
        .await
        .map_err(|error| format!("Não foi possível ler o checksum da atualização: {error}"))?;

    let expected_hash = checksum_from_text(&checksum_text)
        .ok_or_else(|| "O checksum publicado para esta atualização é inválido.".to_string())?;

    let destination = update_download_path(&candidate.version, &candidate.installer.name);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Não foi possível preparar a pasta de atualização: {error}"))?;
    }

    let mut response = http
        .get(&candidate.installer.browser_download_url)
        .send()
        .await
        .map_err(|error| format!("Não foi possível baixar a atualização: {error}"))?
        .error_for_status()
        .map_err(|error| format!("O instalador da atualização não está disponível: {error}"))?;

    let total_bytes = response
        .content_length()
        .unwrap_or(candidate.installer.size);

    let mut file = File::create(&destination)
        .map_err(|error| format!("Não foi possível criar o instalador temporário: {error}"))?;
    let mut hasher = Sha256::new();
    let mut downloaded_bytes = 0_u64;

    let _ = app.emit(
        "update-progress",
        UpdateProgress {
            downloaded_bytes,
            total_bytes,
        },
    );

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("O download da atualização foi interrompido: {error}"))?
    {
        file.write_all(&chunk)
            .map_err(|error| format!("Não foi possível salvar a atualização: {error}"))?;
        hasher.update(&chunk);
        downloaded_bytes += chunk.len() as u64;

        let _ = app.emit(
            "update-progress",
            UpdateProgress {
                downloaded_bytes,
                total_bytes,
            },
        );
    }

    file.flush()
        .map_err(|error| format!("Não foi possível finalizar o instalador temporário: {error}"))?;

    let actual_hash = format!("{:x}", hasher.finalize());
    if actual_hash != expected_hash {
        let _ = fs::remove_file(&destination);
        return Err("A atualização baixada falhou na validação SHA-256 e foi descartada.".to_string());
    }

    Ok(DownloadedUpdate {
        version: candidate.version.to_string(),
        installer_path: destination.to_string_lossy().into_owned(),
        installer_name: candidate.installer.name,
        size: downloaded_bytes,
        sha256: actual_hash,
    })
}

fn updates_root() -> PathBuf {
    std::env::temp_dir().join("L.I.V.I.A").join("updates")
}

fn is_safe_installer_path(path: &Path) -> Result<bool, String> {
    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("O instalador baixado não pôde ser localizado: {error}"))?;
    let root = fs::canonicalize(updates_root())
        .map_err(|error| format!("A área temporária de atualizações não pôde ser validada: {error}"))?;

    let file_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    Ok(canonical.starts_with(root)
        && file_name.starts_with("l.i.v.i.a")
        && file_name.ends_with(".exe"))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    use std::io::Read;

    let mut file = File::open(path)
        .map_err(|error| format!("Não foi possível reabrir o instalador para validação: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Não foi possível validar o instalador: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

#[tauri::command]
pub fn install_update(
    app: AppHandle,
    installer_path: String,
    expected_sha256: String,
) -> Result<(), String> {
    let installer = PathBuf::from(installer_path);

    if !is_safe_installer_path(&installer)? {
        return Err("O instalador informado não pertence à área temporária segura da L.I.V.I.A.".to_string());
    }

    let expected = expected_sha256.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|value| value.is_ascii_hexdigit()) {
        return Err("O checksum esperado para a atualização é inválido.".to_string());
    }

    let actual = sha256_file(&installer)?;
    if actual != expected {
        let _ = fs::remove_file(&installer);
        return Err("O instalador mudou depois do download, falhou na segunda validação SHA-256 e foi descartado.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new(&installer)
            .spawn()
            .map_err(|error| format!("Não foi possível abrir o instalador da atualização: {error}"))?;
        app.exit(0);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("A atualização automática desta release está disponível apenas no Windows.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{checksum_from_text, parse_release_version};

    #[test]
    fn parses_prefixed_release_version() {
        assert_eq!(
            parse_release_version("v0.6.1").map(|value| value.to_string()),
            Some("0.6.1".to_string())
        );
    }

    #[test]
    fn rejects_invalid_release_version() {
        assert!(parse_release_version("release-next").is_none());
    }

    #[test]
    fn reads_standard_sha256_file() {
        let hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert_eq!(
            checksum_from_text(&format!("{hash}  installer.exe")),
            Some(hash.to_string())
        );
    }

    #[test]
    fn rejects_short_checksum() {
        assert!(checksum_from_text("abc123 installer.exe").is_none());
    }
}
