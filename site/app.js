const REPO = "tombemol/L.I.V.I.A";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=12`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

const $ = (id) => document.getElementById(id);

const primary = $("primary-download");
const primaryLabel = $("primary-download-label");
const releaseStatus = $("release-status");
const downloadVersion = $("download-version");
const windowsDownload = $("windows-download");
const linuxDownload = $("linux-download");
const linuxLabel = $("linux-label");

function detectPlatform() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "").toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux") || platform.includes("android")) return "linux";
  return "other";
}

function pickAsset(releases, matcher) {
  for (const release of releases) {
    if (release.draft) continue;
    const asset = (release.assets || []).find(matcher);
    if (asset) return { release, asset };
  }
  return null;
}

function formatVersion(tag) {
  return (tag || "").replace(/^v/i, "");
}

function applyPlatformPreference(platform, windowsAsset, linuxAsset) {
  if (platform === "linux") {
    if (linuxAsset) {
      primary.href = linuxAsset.asset.browser_download_url;
      primaryLabel.textContent = "Baixar para Linux";
    } else {
      primary.href = RELEASES_PAGE;
      primaryLabel.textContent = "Linux em preparação";
    }
    return;
  }

  if (platform === "windows" && windowsAsset) {
    primary.href = windowsAsset.asset.browser_download_url;
    primaryLabel.textContent = "Baixar para Windows";
    return;
  }

  if (windowsAsset) {
    primary.href = windowsAsset.asset.browser_download_url;
    primaryLabel.textContent = "Baixar para Windows";
  } else {
    primary.href = RELEASES_PAGE;
    primaryLabel.textContent = "Ver downloads";
  }
}

async function hydrateReleases() {
  const platform = detectPlatform();

  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" }
    });

    if (!response.ok) throw new Error(`GitHub API respondeu ${response.status}`);

    const releases = await response.json();
    const visible = releases.find((release) => !release.draft);

    const windowsAsset = pickAsset(
      releases,
      (asset) => /(?:x64|amd64).*setup\.exe$/i.test(asset.name) || /\.exe$/i.test(asset.name)
    );

    const linuxAsset = pickAsset(
      releases,
      (asset) => /\.(?:AppImage|deb)$/i.test(asset.name)
    );

    if (visible) {
      const version = formatVersion(visible.tag_name);
      const suffix = visible.prerelease ? " · pré-release" : "";
      releaseStatus.textContent = `v${version}${suffix}`;
      downloadVersion.textContent = `Versão mais recente: v${version}${suffix}`;
    } else {
      releaseStatus.textContent = "Releases públicas no GitHub";
      downloadVersion.textContent = "Versões publicadas no GitHub";
    }

    if (windowsAsset) {
      windowsDownload.href = windowsAsset.asset.browser_download_url;
      windowsDownload.querySelector("small").textContent =
        `x64 · ${formatVersion(windowsAsset.release.tag_name)}`;
    }

    if (linuxAsset) {
      linuxDownload.href = linuxAsset.asset.browser_download_url;
      linuxDownload.classList.add("ready");
      linuxLabel.textContent = "Baixar ↓";
      linuxDownload.querySelector("small").textContent =
        `${linuxAsset.asset.name.endsWith(".deb") ? ".deb" : "AppImage"} · ${formatVersion(linuxAsset.release.tag_name)}`;
    } else {
      linuxDownload.href = RELEASES_PAGE;
      linuxDownload.setAttribute("aria-label", "Linux está em preparação. Ver releases.");
      linuxLabel.textContent = "Em preparação";
    }

    applyPlatformPreference(platform, windowsAsset, linuxAsset);
  } catch (error) {
    console.warn("Não foi possível consultar as releases agora:", error);
    releaseStatus.textContent = "Downloads via GitHub Releases";
    downloadVersion.textContent = "Consulte a versão mais recente no GitHub";
    primary.href = RELEASES_PAGE;
    windowsDownload.href = RELEASES_PAGE;
    linuxDownload.href = RELEASES_PAGE;

    if (platform === "linux") primaryLabel.textContent = "Ver versões para Linux";
    else primaryLabel.textContent = "Ver downloads";
  }
}

hydrateReleases();
