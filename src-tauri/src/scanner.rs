use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

const ONE_MB: u64 = 1024 * 1024;
const ONE_GB: u64 = 1024 * ONE_MB;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub extension: String,
    pub modified_secs: Option<u64>,
    pub age_days: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSummary {
    pub extension: String,
    pub size: u64,
    pub count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySummary {
    pub name: String,
    pub size: u64,
    pub file_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub age_days: Option<u64>,
    pub category: String,
    pub reason: String,
    pub risk: String,
    pub confidence: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub root: String,
    pub total_size: u64,
    pub file_count: u64,
    pub folder_count: u64,
    pub skipped_entries: u64,
    pub duration_ms: u128,
    pub largest_files: Vec<FileEntry>,
    pub extensions: Vec<ExtensionSummary>,
    pub directories: Vec<DirectorySummary>,
    pub recommendations: Vec<Recommendation>,
}

#[derive(Default)]
struct Bucket {
    size: u64,
    count: u64,
}

pub fn scan(input: String) -> Result<ScanReport, String> {
    let started = Instant::now();
    let root = PathBuf::from(input);

    if !root.exists() {
        return Err("O caminho selecionado não existe.".to_string());
    }

    if !root.is_dir() {
        return Err("Selecione uma pasta ou unidade, não um arquivo isolado.".to_string());
    }

    let root = fs::canonicalize(&root).unwrap_or(root);
    let mut total_size = 0_u64;
    let mut file_count = 0_u64;
    let mut folder_count = 0_u64;
    let mut skipped_entries = 0_u64;
    let mut files = Vec::<FileEntry>::new();
    let mut extension_buckets = HashMap::<String, Bucket>::new();
    let mut directory_buckets = HashMap::<String, Bucket>::new();
    let mut recommendations = Vec::<Recommendation>::new();

    for entry in WalkDir::new(&root).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                skipped_entries += 1;
                continue;
            }
        };

        if entry.file_type().is_dir() {
            if entry.path() != root {
                folder_count += 1;
            }
            continue;
        }

        if !entry.file_type().is_file() {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => {
                skipped_entries += 1;
                continue;
            }
        };

        let size = metadata.len();
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let extension = normalized_extension(path);
        let modified_secs = metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs());
        let age_days = metadata
            .modified()
            .ok()
            .and_then(age_in_days);

        total_size = total_size.saturating_add(size);
        file_count += 1;

        let extension_bucket = extension_buckets.entry(extension.clone()).or_default();
        extension_bucket.size = extension_bucket.size.saturating_add(size);
        extension_bucket.count += 1;

        let directory_name = top_level_name(&root, path);
        let directory_bucket = directory_buckets.entry(directory_name).or_default();
        directory_bucket.size = directory_bucket.size.saturating_add(size);
        directory_bucket.count += 1;

        let file = FileEntry {
            path: path.to_string_lossy().to_string(),
            name,
            size,
            extension,
            modified_secs,
            age_days,
        };

        if let Some(recommendation) = recommend(&file) {
            recommendations.push(recommendation);
        }

        files.push(file);
    }

    files.sort_by(|a, b| b.size.cmp(&a.size));
    files.truncate(40);

    recommendations.sort_by(|a, b| {
        b.confidence
            .cmp(&a.confidence)
            .then_with(|| b.size.cmp(&a.size))
    });
    recommendations.truncate(50);

    let mut extensions: Vec<_> = extension_buckets
        .into_iter()
        .map(|(extension, bucket)| ExtensionSummary {
            extension,
            size: bucket.size,
            count: bucket.count,
        })
        .collect();
    extensions.sort_by(|a, b| b.size.cmp(&a.size));
    extensions.truncate(20);

    let mut directories: Vec<_> = directory_buckets
        .into_iter()
        .map(|(name, bucket)| DirectorySummary {
            name,
            size: bucket.size,
            file_count: bucket.count,
        })
        .collect();
    directories.sort_by(|a, b| b.size.cmp(&a.size));

    Ok(ScanReport {
        root: root.to_string_lossy().to_string(),
        total_size,
        file_count,
        folder_count,
        skipped_entries,
        duration_ms: started.elapsed().as_millis(),
        largest_files: files,
        extensions,
        directories,
        recommendations,
    })
}

fn normalized_extension(path: &Path) -> String {
    match path.extension().and_then(|value| value.to_str()) {
        Some(value) if !value.trim().is_empty() => format!(".{}", value.to_ascii_lowercase()),
        _ => "sem extensão".to_string(),
    }
}

fn age_in_days(modified: SystemTime) -> Option<u64> {
    SystemTime::now()
        .duration_since(modified)
        .ok()
        .map(|duration| duration.as_secs() / 86_400)
}

fn top_level_name(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let mut components = relative.components();
    let first = components.next();

    if components.next().is_none() {
        return "(raiz)".to_string();
    }

    first
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .unwrap_or_else(|| "(raiz)".to_string())
}

fn recommend(file: &FileEntry) -> Option<Recommendation> {
    if is_protected_path(&file.path) || is_protected_file(&file.name) {
        return None;
    }

    let extension = file.extension.as_str();
    let age = file.age_days.unwrap_or(0);

    let (category, reason, risk, confidence) =
        if matches!(extension, ".tmp" | ".temp" | ".dmp") && age >= 7 {
            (
                "Temporário",
                "Tipo temporário e sem alteração recente.",
                "Baixo",
                92,
            )
        } else if matches!(extension, ".zip" | ".rar" | ".7z" | ".iso") && age >= 120 && file.size >= 250 * ONE_MB {
            (
                "Arquivo compactado",
                "Arquivo grande, compactado e antigo. Confirme se ainda precisa dele.",
                "Revisar",
                78,
            )
        } else if matches!(extension, ".exe" | ".msi" | ".msix") && age >= 180 && file.size >= 100 * ONE_MB {
            (
                "Instalador antigo",
                "Instalador grande sem alteração há meses. Pode já ter cumprido a função.",
                "Revisar",
                76,
            )
        } else if file.size >= 2 * ONE_GB && age >= 180 {
            (
                "Arquivo muito grande",
                "Ocupa pelo menos 2 GB e não é alterado há mais de seis meses.",
                "Revisar",
                70,
            )
        } else if file.size >= 5 * ONE_GB {
            (
                "Arquivo muito grande",
                "Ocupa pelo menos 5 GB. Vale confirmar se ainda precisa ficar neste disco.",
                "Revisar",
                64,
            )
        } else {
            return None;
        };

    Some(Recommendation {
        path: file.path.clone(),
        name: file.name.clone(),
        size: file.size,
        age_days: file.age_days,
        category: category.to_string(),
        reason: reason.to_string(),
        risk: risk.to_string(),
        confidence,
    })
}

fn is_protected_file(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "pagefile.sys" | "hiberfil.sys" | "swapfile.sys" | "ntuser.dat" | "bootmgr"
    )
}

fn is_protected_path(path: &str) -> bool {
    let normalized = path.replace('/', "\\").to_ascii_lowercase();
    let protected_segments = [
        "\\windows\\",
        "\\program files\\",
        "\\program files (x86)\\",
        "\\programdata\\",
        "\\system volume information\\",
        "\\$recycle.bin\\",
        "\\winsxs\\",
    ];

    protected_segments
        .iter()
        .any(|segment| normalized.contains(segment))
}
