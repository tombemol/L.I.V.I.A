use serde::Serialize;
use std::{
    cmp::{Ordering as CmpOrdering, Reverse},
    collections::{BinaryHeap, HashMap, HashSet},
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
const LARGEST_LIMIT: usize = 500;
const RECOMMENDATION_LIMIT: usize = 50;
const PROGRESS_INTERVAL_MS: u128 = 120;
const SEARCH_LIMIT_MAX: usize = 500;

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
    pub path: String,
    pub size: u64,
    pub file_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCandidate {
    pub size: u64,
    pub count: usize,
    pub potential_savings: u64,
    pub files: Vec<FileEntry>,
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

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanEngine {
    pub mode: String,
    pub label: String,
    pub accelerated: bool,
    pub fallback_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub root: String,
    pub index_root: String,
    pub total_size: u64,
    pub file_count: u64,
    pub folder_count: u64,
    pub skipped_entries: u64,
    pub duration_ms: u128,
    pub indexed_files: usize,
    pub engine: ScanEngine,
    pub largest_files: Vec<FileEntry>,
    pub extensions: Vec<ExtensionSummary>,
    pub directories: Vec<DirectorySummary>,
    pub duplicate_candidates: Vec<DuplicateCandidate>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub total: usize,
    pub duration_ms: u128,
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone)]
pub struct ScanIndex {
    pub root: String,
    pub engine: ScanEngine,
    pub files: Vec<FileEntry>,
}

pub struct ScanBundle {
    pub report: ScanReport,
    pub index: ScanIndex,
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

struct ReportAccumulator {
    root: PathBuf,
    total_size: u64,
    file_count: u64,
    ordinal: u64,
    largest: BinaryHeap<Reverse<RankedFile>>,
    extension_buckets: HashMap<String, Bucket>,
    directory_buckets: HashMap<String, Bucket>,
    recommendations: Vec<Recommendation>,
}

impl ReportAccumulator {
    fn new(root: PathBuf) -> Self {
        Self {
            root,
            total_size: 0,
            file_count: 0,
            ordinal: 0,
            largest: BinaryHeap::new(),
            extension_buckets: HashMap::new(),
            directory_buckets: HashMap::new(),
            recommendations: Vec::new(),
        }
    }

    fn push(&mut self, file: FileEntry) {
        self.total_size = self.total_size.saturating_add(file.size);
        self.file_count += 1;
        self.ordinal += 1;

        let extension_bucket = self
            .extension_buckets
            .entry(file.extension.clone())
            .or_default();
        extension_bucket.size = extension_bucket.size.saturating_add(file.size);
        extension_bucket.count += 1;

        let directory_name = top_level_name(&self.root, Path::new(&file.path));
        let directory_bucket = self.directory_buckets.entry(directory_name).or_default();
        directory_bucket.size = directory_bucket.size.saturating_add(file.size);
        directory_bucket.count += 1;

        keep_largest(&mut self.largest, file.clone(), self.ordinal);

        if let Some(recommendation) = recommend(&file) {
            self.recommendations.push(recommendation);
            if self.recommendations.len() > RECOMMENDATION_LIMIT * 4 {
                sort_and_trim_recommendations(&mut self.recommendations);
            }
        }
    }

    fn finish(
        mut self,
        folder_count: u64,
        skipped_entries: u64,
        duration_ms: u128,
        indexed_files: usize,
        engine: ScanEngine,
        index_root: String,
    ) -> ScanReport {
        let mut largest_files: Vec<_> = self
            .largest
            .into_iter()
            .map(|Reverse(item)| item.file)
            .collect();
        largest_files.sort_by(|a, b| b.size.cmp(&a.size));
        let duplicate_candidates = find_duplicate_candidates(&largest_files);

        sort_and_trim_recommendations(&mut self.recommendations);

        let mut extensions: Vec<_> = self
            .extension_buckets
            .into_iter()
            .map(|(extension, bucket)| ExtensionSummary {
                extension,
                size: bucket.size,
                count: bucket.count,
            })
            .collect();
        extensions.sort_by(|a, b| b.size.cmp(&a.size));
        extensions.truncate(20);

        let mut directories: Vec<_> = self
            .directory_buckets
            .into_iter()
            .map(|(name, bucket)| {
                let path = if name == "(raiz)" {
                    self.root.clone()
                } else {
                    self.root.join(&name)
                };

                DirectorySummary {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size: bucket.size,
                    file_count: bucket.count,
                }
            })
            .collect();
        directories.sort_by(|a, b| b.size.cmp(&a.size));

        ScanReport {
            root: self.root.to_string_lossy().to_string(),
            index_root,
            total_size: self.total_size,
            file_count: self.file_count,
            folder_count,
            skipped_entries,
            duration_ms,
            indexed_files,
            engine,
            largest_files,
            extensions,
            directories,
            duplicate_candidates,
            recommendations: self.recommendations,
        }
    }
}

pub fn scan<F>(
    input: String,
    cancel: Arc<AtomicBool>,
    mut on_progress: F,
) -> Result<ScanBundle, String>
where
    F: FnMut(ScanProgress),
{
    let root = PathBuf::from(&input);
    validate_root(&root)?;

    #[cfg(target_os = "windows")]
    {
        if drive_letter_root(&root).is_some() {
            match scan_mft(root.clone(), Arc::clone(&cancel), &mut on_progress) {
                Ok(bundle) => return Ok(bundle),
                Err(mft_error) => {
                    return scan_walkdir(
                        root,
                        cancel,
                        &mut on_progress,
                        Some(format!(
                            "MFT indisponível nesta execução ({mft_error}). Foi usado o scanner compatível."
                        )),
                    );
                }
            }
        }
    }

    scan_walkdir(root, cancel, &mut on_progress, None)
}

fn scan_walkdir<F>(
    root: PathBuf,
    cancel: Arc<AtomicBool>,
    on_progress: &mut F,
    fallback_reason: Option<String>,
) -> Result<ScanBundle, String>
where
    F: FnMut(ScanProgress),
{
    let started = Instant::now();
    let now = SystemTime::now();
    let display_root = root.to_string_lossy().to_string();
    let mut report = ReportAccumulator::new(root.clone());
    let mut index_files = Vec::<FileEntry>::new();
    let mut folder_count = 0_u64;
    let mut skipped_entries = 0_u64;
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
                on_progress,
                &display_root,
                report.file_count,
                folder_count,
                skipped_entries,
                report.total_size,
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

        let file = file_entry_from_metadata(entry.path(), &metadata, now);
        report.push(file.clone());
        index_files.push(file);

        emit_progress_if_needed(
            on_progress,
            &display_root,
            report.file_count,
            folder_count,
            skipped_entries,
            report.total_size,
            started,
            &mut last_progress,
            entry.path(),
        );
    }

    on_progress(ScanProgress {
        root: display_root.clone(),
        files_scanned: report.file_count,
        folders_scanned: folder_count,
        skipped_entries,
        bytes_scanned: report.total_size,
        elapsed_ms: started.elapsed().as_millis(),
        current_path: display_root.clone(),
    });

    let engine = ScanEngine {
        mode: "walkdir-index".to_string(),
        label: "Índice local".to_string(),
        accelerated: false,
        fallback_reason,
    };
    let indexed_files = index_files.len();
    let scan_report = report.finish(
        folder_count,
        skipped_entries,
        started.elapsed().as_millis(),
        indexed_files,
        engine.clone(),
        display_root.clone(),
    );

    Ok(ScanBundle {
        report: scan_report,
        index: ScanIndex {
            root: display_root,
            engine,
            files: index_files,
        },
    })
}

#[cfg(target_os = "windows")]
fn scan_mft<F>(
    root: PathBuf,
    cancel: Arc<AtomicBool>,
    on_progress: &mut F,
) -> Result<ScanBundle, String>
where
    F: FnMut(ScanProgress),
{
    use usn_journal_rs::volume::Volume;

    let drive_letter =
        drive_letter_root(&root).ok_or_else(|| "o caminho não é uma raiz de unidade".to_string())?;
    let volume = Volume::from_drive_letter(drive_letter).map_err(|error| error.to_string())?;
    let mft = volume.mft();
    let mut resolver = volume.path_resolver_with_cache();

    let started = Instant::now();
    let now = SystemTime::now();
    let display_root = root.to_string_lossy().to_string();
    let mut report = ReportAccumulator::new(root.clone());
    let mut index_files = Vec::<FileEntry>::new();
    let mut folder_count = 0_u64;
    let mut skipped_entries = 0_u64;
    let mut last_progress = Instant::now();

    for result in mft.iter() {
        if cancel.load(AtomicOrdering::Relaxed) {
            return Err("Análise cancelada.".to_string());
        }

        let entry = match result {
            Ok(entry) => entry,
            Err(_) => {
                skipped_entries += 1;
                continue;
            }
        };

        let path = match resolver.resolve_path(&entry) {
            Some(path) => path,
            None => {
                skipped_entries += 1;
                continue;
            }
        };

        if entry.is_dir() {
            if path != root {
                folder_count += 1;
            }

            emit_progress_if_needed(
                on_progress,
                &display_root,
                report.file_count,
                folder_count,
                skipped_entries,
                report.total_size,
                started,
                &mut last_progress,
                &path,
            );
            continue;
        }

        let metadata = match fs::metadata(&path) {
            Ok(metadata) if metadata.is_file() => metadata,
            _ => {
                skipped_entries += 1;
                continue;
            }
        };

        let file = file_entry_from_metadata(&path, &metadata, now);
        report.push(file.clone());
        index_files.push(file);

        emit_progress_if_needed(
            on_progress,
            &display_root,
            report.file_count,
            folder_count,
            skipped_entries,
            report.total_size,
            started,
            &mut last_progress,
            &path,
        );
    }

    if index_files.is_empty() {
        return Err("a enumeração MFT não retornou arquivos".to_string());
    }

    on_progress(ScanProgress {
        root: display_root.clone(),
        files_scanned: report.file_count,
        folders_scanned: folder_count,
        skipped_entries,
        bytes_scanned: report.total_size,
        elapsed_ms: started.elapsed().as_millis(),
        current_path: display_root.clone(),
    });

    let engine = ScanEngine {
        mode: "ntfs-mft".to_string(),
        label: "NTFS / MFT".to_string(),
        accelerated: true,
        fallback_reason: None,
    };
    let indexed_files = index_files.len();
    let scan_report = report.finish(
        folder_count,
        skipped_entries,
        started.elapsed().as_millis(),
        indexed_files,
        engine.clone(),
        display_root.clone(),
    );

    Ok(ScanBundle {
        report: scan_report,
        index: ScanIndex {
            root: display_root,
            engine,
            files: index_files,
        },
    })
}

pub fn browse_index(index: &ScanIndex, path: String) -> Result<ScanReport, String> {
    let started = Instant::now();
    let scope = PathBuf::from(&path);

    if !is_scope_inside_root(&scope, Path::new(&index.root)) {
        return Err("Este caminho não pertence ao índice atual.".to_string());
    }

    let mut report = ReportAccumulator::new(scope.clone());
    let mut directories = HashSet::<PathBuf>::new();

    for file in &index.files {
        let file_path = Path::new(&file.path);
        if !is_scope_inside_root(file_path, &scope) {
            continue;
        }

        if let Some(parent) = file_path.parent() {
            let mut cursor = parent.to_path_buf();
            while is_scope_inside_root(&cursor, &scope) && cursor != scope {
                directories.insert(cursor.clone());
                let Some(next) = cursor.parent() else {
                    break;
                };
                cursor = next.to_path_buf();
            }
        }

        report.push(file.clone());
    }

    if report.file_count == 0 {
        return Err("Nenhum arquivo do índice foi encontrado neste caminho.".to_string());
    }

    Ok(report.finish(
        directories.len() as u64,
        0,
        started.elapsed().as_millis(),
        index.files.len(),
        index.engine.clone(),
        index.root.clone(),
    ))
}

pub fn search_index(
    index: &ScanIndex,
    scope: String,
    query: String,
    extension: String,
    min_size: u64,
    sort_key: String,
    sort_direction: String,
    limit: usize,
) -> SearchResponse {
    let started = Instant::now();
    let scope_path = PathBuf::from(scope);
    let query = query.trim().to_string();
    let mut matches: Vec<&FileEntry> = index
        .files
        .iter()
        .filter(|file| {
            is_scope_inside_root(Path::new(&file.path), &scope_path)
                && file.size >= min_size
                && (extension == "all" || file.extension == extension)
                && (query.is_empty()
                    || contains_case_insensitive(&file.path, &query)
                    || contains_case_insensitive(&file.name, &query))
        })
        .collect();

    matches.sort_by(|a, b| {
        let ordering = match sort_key.as_str() {
            "name" => a.name.cmp(&b.name),
            "extension" => a.extension.cmp(&b.extension),
            "age" => a.age_days.unwrap_or(0).cmp(&b.age_days.unwrap_or(0)),
            _ => a.size.cmp(&b.size),
        };

        if sort_direction == "asc" {
            ordering
        } else {
            ordering.reverse()
        }
    });

    let total = matches.len();
    let files = matches
        .into_iter()
        .take(limit.clamp(1, SEARCH_LIMIT_MAX))
        .cloned()
        .collect();

    SearchResponse {
        total,
        duration_ms: started.elapsed().as_millis(),
        files,
    }
}

fn validate_root(root: &Path) -> Result<(), String> {
    if !root.exists() {
        return Err("O caminho selecionado não existe.".to_string());
    }
    if !root.is_dir() {
        return Err("Selecione uma pasta ou unidade, não um arquivo isolado.".to_string());
    }
    Ok(())
}

fn file_entry_from_metadata(path: &Path, metadata: &fs::Metadata, now: SystemTime) -> FileEntry {
    let modified = metadata.modified().ok();
    FileEntry {
        path: path.to_string_lossy().to_string(),
        name: path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string()),
        size: metadata.len(),
        extension: normalized_extension(path),
        modified_secs: modified
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs()),
        age_days: modified.and_then(|value| age_in_days(value, now)),
    }
}

fn find_duplicate_candidates(files: &[FileEntry]) -> Vec<DuplicateCandidate> {
    let mut groups = HashMap::<u64, Vec<FileEntry>>::new();

    for file in files.iter().filter(|file| file.size >= ONE_MB) {
        groups.entry(file.size).or_default().push(file.clone());
    }

    let mut candidates: Vec<_> = groups
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .map(|(size, mut files)| {
            files.sort_by(|a, b| a.path.cmp(&b.path));
            let count = files.len();
            DuplicateCandidate {
                size,
                count,
                potential_savings: size.saturating_mul(count.saturating_sub(1) as u64),
                files: files.into_iter().take(6).collect(),
            }
        })
        .collect();

    candidates.sort_by(|a, b| {
        b.potential_savings
            .cmp(&a.potential_savings)
            .then_with(|| b.count.cmp(&a.count))
    });
    candidates.truncate(12);
    candidates
}

fn keep_largest(heap: &mut BinaryHeap<Reverse<RankedFile>>, file: FileEntry, ordinal: u64) {
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

fn is_scope_inside_root(candidate: &Path, scope: &Path) -> bool {
    candidate == scope || candidate.strip_prefix(scope).is_ok()
}

fn contains_case_insensitive(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }

    if haystack.is_ascii() && needle.is_ascii() {
        let haystack = haystack.as_bytes();
        let needle = needle.as_bytes();
        return haystack.windows(needle.len()).any(|window| {
            window
                .iter()
                .zip(needle)
                .all(|(left, right)| left.eq_ignore_ascii_case(right))
        });
    }

    haystack.to_lowercase().contains(&needle.to_lowercase())
}

#[cfg(target_os = "windows")]
fn drive_letter_root(path: &Path) -> Option<char> {
    let raw = path.to_string_lossy();
    let trimmed = raw.trim_end_matches(['\\', '/']);

    if trimmed.len() != 2 || !trimmed.ends_with(':') {
        return None;
    }

    let drive = trimmed.chars().next()?;
    drive.is_ascii_alphabetic().then(|| drive.to_ascii_uppercase())
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
