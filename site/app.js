const REPO = "tombemol/L.I.V.I.A";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=12`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

const PIX_KEY = "c6086883-d194-4e32-b803-dcb97a5daef5";
const PIX_PAYLOAD = "00020126580014BR.GOV.BCB.PIX0136c6086883-d194-4e32-b803-dcb97a5daef55204000053039865802BR5913ANTONIO SILVA6011SANTO AMARO62070503***6304F8E2";

const $ = (id) => document.getElementById(id);

const primary = $("primary-download");
const primaryLabel = $("primary-download-label");
const releaseStatus = $("release-status");
const downloadVersion = $("download-version");
const windowsDownload = $("windows-download");
const linuxDownload = $("linux-download");
const linuxLabel = $("linux-label");
const donationDialog = $("donation-dialog");
const copyFeedback = $("copy-feedback");

function detectPlatform() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  const ua = (navigator.userAgent || "").toLowerCase();

  if (ua.includes("android")) return "other";
  if (platform.includes("win") || ua.includes("windows")) return "windows";
  if (platform.includes("linux") || ua.includes("linux")) return "linux";
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

function setupReveal() {
  const items = [...document.querySelectorAll("[data-reveal]")];

  for (const item of items) {
    const delay = Number(item.dataset.delay || 0);
    item.style.setProperty("--reveal-delay", `${delay}ms`);
  }

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.14, rootMargin: "0px 0px -30px" }
  );

  items.forEach((item) => observer.observe(item));
}

function setupParallax() {
  const target = document.querySelector("[data-parallax]");
  if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const wrapper = target.closest(".hero-product");
  if (!wrapper) return;

  wrapper.addEventListener("pointermove", (event) => {
    if (window.innerWidth < 1020) return;

    const rect = wrapper.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    target.style.transform =
      `perspective(1600px) rotateY(${(-3 + x * 3.2).toFixed(2)}deg) rotateX(${(1 - y * 2.4).toFixed(2)}deg) translateY(-2px)`;
  });

  wrapper.addEventListener("pointerleave", () => {
    target.style.transform = "perspective(1600px) rotateY(-3deg) rotateX(1deg)";
  });
}

function setupDonation() {
  if (!donationDialog) return;

  document.querySelectorAll("[data-open-donation]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof donationDialog.showModal === "function") donationDialog.showModal();
      else donationDialog.setAttribute("open", "");
    });
  });

  document.querySelectorAll("[data-close-donation]").forEach((button) => {
    button.addEventListener("click", () => donationDialog.close());
  });

  donationDialog.addEventListener("click", (event) => {
    if (event.target === donationDialog) donationDialog.close();
  });

  donationDialog.addEventListener("close", () => {
    if (copyFeedback) copyFeedback.textContent = "";
  });
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  if (copyFeedback) {
    copyFeedback.textContent = successMessage;
    window.setTimeout(() => {
      if (copyFeedback.textContent === successMessage) copyFeedback.textContent = "";
    }, 2200);
  }
}

document.querySelector("[data-copy-pix-key]")?.addEventListener("click", () => {
  copyText(PIX_KEY, "Chave Pix copiada.");
});

document.querySelector("[data-copy-pix-payload]")?.addEventListener("click", () => {
  copyText(PIX_PAYLOAD, "Pix copia e cola copiado.");
});

hydrateReleases();
setupReveal();
setupParallax();
setupDonation();
