const REPO = "tombemol/L.I.V.I.A";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=12`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

const PIX_KEY = "c6086883-d194-4e32-b803-dcb97a5daef5";
const PIX_PAYLOAD = "00020126580014BR.GOV.BCB.PIX0136c6086883-d194-4e32-b803-dcb97a5daef55204000053039865802BR5913ANTONIO SILVA6011SANTO AMARO62070503***6304F8E2";
const PIX_QR = [
  "00000000000000000000000000000000000000000000000000000",
  "00000000000000000000000000000000000000000000000000000",
  "00000000000000000000000000000000000000000000000000000",
  "00000000000000000000000000000000000000000000000000000",
  "00001111111000111100101000011101010101001011111110000",
  "00001000001000000111101000010000000111010010000010000",
  "00001011101000111100110000100111111001010010111010000",
  "00001011101001101111000011111111000100011010111010000",
  "00001011101001111110111111111001100001111010111010000",
  "00001000001011101010000010001111100101000010000010000",
  "00001111111010101010101010101010101010101011111110000",
  "00000000000001010101000110001001010111100000000000000",
  "00001001011011010001011011111001100010110101000000000",
  "00000100000111000110000101010100000010111100111100000",
  "00001011001011101110001110010110101110000110011110000",
  "00000100100101100110010001101110010111110101010110000",
  "00001010001101110010110001110110101101100110100010000",
  "00000100010010110001010111100110110101010011110100000",
  "00001000111001000110111001111000111001100010111100000",
  "00001101100000111100111111010010011111110000110010000",
  "00001010111011011101000011001000110100001011001110000",
  "00000011000100111110110101101011010111000111011010000",
  "00000001001110100101010101100011011000001001001110000",
  "00001100000011011111011001000000110111110011111000000",
  "00000000111111110110001111111100101011101111111000000",
  "00001100100011001011101010001100111101011000110000000",
  "00000001101010100111010110101010011001001010101100000",
  "00001110100011110010101010001011111110001000100010000",
  "00001111111111101010010011111011101011101111101010000",
  "00001110000101010010110010011100000111110010011000000",
  "00001011101101011000111110101000010000101001100000000",
  "00000011110110111011000100110111001001110101110100000",
  "00000011111000000001010100011011100111011110000110000",
  "00000000000011101110101111000101111001100110000010000",
  "00000100011100110100100000111101001001111100101010000",
  "00000111110110110100000001010000110011000011100100000",
  "00001101101110111101000001101001101000100001011110000",
  "00000110110010110101111010110011010010010000011100000",
  "00000000101001001001011111101101110011111010001010000",
  "00000111100001010110111001100001101111000101000010000",
  "00001001101101101101010011111000111010101111101010000",
  "00000000000010000001101010001110000110001000100000000",
  "00001111111000101010110110101000010000011010111110000",
  "00001000001010001111011110001000110100011000110000000",
  "00001011101001111000111111111101001111011111101110000",
  "00001011101011011011100000100100111010011011000010000",
  "00001011101001110111101000111001000111010011111010000",
  "00001000001001111100011001110010110011110001011010000",
  "00001111111011101010110011111110101101111000111000000",
  "00000000000000000000000000000000000000000000000000000",
  "00000000000000000000000000000000000000000000000000000",
  "00000000000000000000000000000000000000000000000000000",
  "00000000000000000000000000000000000000000000000000000"
];

const $ = (id) => document.getElementById(id);

const primary = $("primary-download");
const primaryLabel = $("primary-download-label");
const releaseStatus = $("release-status");
const downloadVersion = $("download-version");
const windowsDownload = $("windows-download");
const linuxDownload = $("linux-download");
const linuxLabel = $("linux-label");
const androidDownload = $("android-download");
const androidLabel = $("android-label");
const donationDialog = $("donation-dialog");
const copyFeedback = $("copy-feedback");

function detectPlatform() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  const ua = (navigator.userAgent || "").toLowerCase();

  if (ua.includes("android")) return "android";
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

function applyPlatformPreference(platform, windowsAsset, linuxAsset, androidAsset) {
  if (platform === "android") {
    if (androidAsset) {
      primary.href = androidAsset.asset.browser_download_url;
      primaryLabel.textContent = "Baixar protótipo Android";
    } else {
      primary.href = RELEASES_PAGE;
      primaryLabel.textContent = "Android em preparação";
    }
    return;
  }

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

    const androidAsset = pickAsset(
      releases,
      (asset) => /android.*(?:arm64|aarch64).*\.apk$/i.test(asset.name) || /\.apk$/i.test(asset.name)
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

    if (androidAsset) {
      androidDownload.hidden = false;
      androidDownload.href = androidAsset.asset.browser_download_url;
      androidDownload.classList.add("ready");
      androidLabel.textContent = "Experimental ↓";
      androidDownload.querySelector("small").textContent =
        `ARM64 · v${formatVersion(androidAsset.release.tag_name)}`;
    }

    applyPlatformPreference(platform, windowsAsset, linuxAsset, androidAsset);
  } catch (error) {
    console.warn("Não foi possível consultar as releases agora:", error);
    releaseStatus.textContent = "Downloads via GitHub Releases";
    downloadVersion.textContent = "Consulte a versão mais recente no GitHub";
    primary.href = RELEASES_PAGE;
    windowsDownload.href = RELEASES_PAGE;
    linuxDownload.href = RELEASES_PAGE;
    androidDownload.href = RELEASES_PAGE;

    if (platform === "android") primaryLabel.textContent = "Ver versão Android";
    else if (platform === "linux") primaryLabel.textContent = "Ver versões para Linux";
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

function renderPixQr() {
  const host = $("pix-qr");
  if (!host) return;

  const size = PIX_QR.length;
  const rects = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (PIX_QR[y][x] === "1") rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }

  host.innerHTML =
    `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`;
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
renderPixQr();
setupDonation();
