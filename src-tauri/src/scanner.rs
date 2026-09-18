use serde::Serialize;
use std::{
    cmp::{Ordering as CmpOrdering, Reverse},
    collections::{BinaryHeap, HashMap},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering as AtomicOrdering},
        Arc,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

const ONE_MB: u64 = 1024 * 1024;
const ONE_GB: u64 = 1024 * ONE_MB;
const LARGEST_LIMIT: usize = 40;
const RECOMMENDATION_LIMIT: usize = 50;
const PROGRESS_INTERVAL_MS: u128 = 120;

#[derive(Debug, Serialize, Clone, Eq, PartialEq)]
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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub root: String,
    pub files_scanned: u64,
    pub folders_scanned: u64,
    pub skipped_entries: u64,
    pub bytes_scanned: u64,
    pub elapsed_ms: u128,
    pub current_path: String,
}

#[derive(Default)]
struct Bucket {
    size: u64,
    count: u64,
}

#[derive(Eq, PartialEq)]
struct RankedFile {
    size: u64,
    ordinal: u64,
    file: FileEntry,
}

impl Ord for RankedFile {
    fn cmp(&self, other: &Self) -> CmpOrdering {
        self.size
            .cmp(&other.size)
            .then_with(|| self.ordinal.cmp(&other.ordinal))
    }
}

impl PartialOrd for RankedFile {
    fn partial_cmp(&self, other: &Self) -> Option<CmpOrdering> {
        Some(self.cmp(other))
    }
}

pub fn scan<F>(
    input: String,
    cancel: Arc<AtomicBool>,
    mut on_progress: F,
) -> Result<ScanReport, String>
where
    F: FnMut(ScanProgress),
{
    let started = Instant::now();
    let now = SystemTime::now();
    let root = PathBuf::from(&input);

    if !root.exists() {
        return Err("O caminho selecionado não existe.".to_string());
    }

    if !root.is_dir() {
        return Err("Selecione uma pasta ou unidade, não um arquivo isolado.".to_string());
    }

    let display_root = root.to_string_lossy().to_string();
    let mut total_size = 0_u64;
    let mut file_count = 0_u64;
    let mut folder_count = 0_u64;
    let mut skipped_entries = 0_u64;
    let mut ordinal = 0_u64;
    let mut largest = BinaryHeap::<Reverse<RankedFile>>::new();
    let mut extension_buckets = HashMap::<String, Bucket>::new();
    let mut directory_buckets = HashMap::<String, Bucket>::new();
    let mut recommendations = Vec::<Recommendation>::new();
    let mut last_progress = Instant::now();

    let walker = WalkDir::new(&root)
        .follow_links(false)
        .same_file_system(true)
        .max_open(64)
        .into_iter();

    for entry in walker {
        if cancel.load(AtomicOrdering::Relaxed) {
            return Err("Análise cancelada.".to_string());
        }

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

            emit_progress_if_needed(
                &mut on_progress,
                &display_root,
                file_count,
                folder_count,
                skipped_entries,
                total_size,
                started,
                &mut last_progress,
                entry.path(),
            );
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
        let modified = metadata.modified().ok();
        let modified_secs = modified
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs());
        let age_days = modified.and_then(|value| age_in_days(value, now));

        total_size = total_size.saturating_add(size);
        file_count += 1;
        ordinal += 1;

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

        keep_largest(&mut largest, file.clone(), ordinal);

        if let Some(recommendation) = recommend(&file) {
            recommendations.push(recommendation);

            if recommendations.len() > RECOMMENDATION_LIMIT * 4 {
                sort_and_trim_recommendations(&mut recommendations);
            }
        }

        emit_progress_if_needed(
            &mut on_progress,
            &display_root,
            file_count,
            folder_count,
            skipped_entries,
            total_size,
            started,
            &mut last_progress,
            path,
        );
    }

    on_progress(ScanProgress {
        root: display_root.clone(),
        files_scanned: file_count,
        folders_scanned: folder_count,
        skipped_entries,
        bytes_scanned: total_size,
        elapsed_ms: started.elapsed().as_millis(),
        current_path: display_root.clone(),
    });

    let mut largest_files: Vec<_> = largest
        .into_iter()
        .map(|Reverse(item)| item.file)
        .collect();
    largest_files.sort_by(|a, b| b.size.cmp(&a.size));

    sort_and_trim_recommendations(&mut recommendations);

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
        root: display_root,
        total_size,
        file_count,
        folder_count,
        skipped_entries,
        duration_ms: started.elapsed().as_millis(),
        largest_files,
        extensions,
        directories,
        recommendations,
    })
}

fn keep_largest(
    heap: &mut BinaryHeap<Reverse<RankedFile>>,
    file: FileEntry,
    ordinal: u64,
) {
    let item = RankedFile {
        size: file.size,
        ordinal,
        file,
    };

    if heap.len() < LARGEST_LIMIT {
        heap.push(Reverse(item));
        return;
    }

    let should_replace = heap
        .peek()
        .map(|Reverse(current)| item.size > current.size)
        .unwrap_or(true);

    if should_replace {
        heap.pop();
        heap.push(Reverse(item));
    }
}

#[allow(clippy::too_many_arguments)]
fn emit_progress_if_needed<F>(
    on_progress: &mut F,
    root: &str,
    file_count: u64,
    folder_count: u64,
    skipped_entries: u64,
    total_size: u64,
    started: Instant,
    last_progress: &mut Instant,
    current_path: &Path,
) where
    F: FnMut(ScanProgress),
{
    if last_progress.elapsed().as_millis() < PROGRESS_INTERVAL_MS {
        return;
    }

    on_progress(ScanProgress {
        root: root.to_string(),
        files_scanned: file_count,
        folders_scanned: folder_count,
        skipped_entries,
        bytes_scanned: total_size,
        elapsed_ms: started.elapsed().as_millis(),
        current_path: current_path.to_string_lossy().to_string(),
    });

    *last_progress = Instant::now();
}

fn sort_and_trim_recommendations(recommendations: &mut Vec<Recommendation>) {
    recommendations.sort_by(|a, b| {
        b.confidence
            .cmp(&a.confidence)
            .then_with(|| b.size.cmp(&a.size))
    });
    recommendations.truncate(RECOMMENDATION_LIMIT);
}

fn normalized_extension(path: &Path) -> String {
    match path.extension().and_then(|value| value.to_str()) {
        Some(value) if !value.trim().is_empty() => format!(".{}", value.to_ascii_lowercase()),
        _ => "sem extensão".to_string(),
    }
}

fn age_in_days(modified: SystemTime, now: SystemTime) -> Option<u64> {
    now.duration_since(modified)
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
        } else if matches!(extension, ".zip" | ".rar" | ".7z" | ".iso")
            && age >= 120
            && file.size >= 250 * ONE_MB
        {
            (
                "Arquivo compactado",
                "Arquivo grande, compactado e antigo. Confirme se ainda precisa dele.",
                "Revisar",
                78,
            )
        } else if matches!(extension, ".exe" | ".msi" | ".msix")
            && age >= 180
            && file.size >= 100 * ONE_MB
        {
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
