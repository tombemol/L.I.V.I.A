import { useEffect, useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import type { DuplicateReport, FileEntry, ScanProgress, ScanReport } from "../types";
import { formatBytes, shortPath } from "../lib/format";

type Mood =
  | "normal"
  | "scanning"
  | "happy"
  | "surprised"
  | "suspicious"
  | "judging"
  | "explaining"
  | "worried"
  | "celebrating"
  | "messy";

type Props = {
  busy?: boolean;
  browsing?: boolean;
  error?: string | null;
  progress?: ScanProgress | null;
  report?: ScanReport | null;
  selectedFile?: FileEntry | null;
  duplicateBusy?: boolean;
  duplicateReport?: DuplicateReport | null;
};

type AssistantState = {
  mood: Mood;
  title: string;
  message: string;
  key: string;
};

const moodIndex: Record<Mood, number> = {
  normal: 0,
  happy: 1,
  surprised: 3,
  suspicious: 4,
  judging: 5,
  explaining: 6,
  worried: 7,
  celebrating: 8,
  messy: 9,
  scanning: 2
};

function years(days: number) {
  return Math.max(1, Math.floor(days / 365));
}

function fileComment(file: FileEntry) {
  const ext = file.extension.toLocaleLowerCase("pt-BR").replace(/^\./, "");
  const explanations: Record<string, string> = {
    dll: "DLL é uma biblioteca compartilhada usada por outros programas. Apagar no impulso é uma forma eficiente de descobrir quantas coisas dependiam dela.",
    pak: "PAK costuma ser um pacote de recursos de jogos ou aplicativos. Pode guardar texturas, áudio, mapas e outros arquivos que o programa espera encontrar.",
    exe: "EXE é um executável do Windows. Ele pode ser um instalador, programa ou ferramenta. Convém saber quem o usa antes de mexer.",
    sys: "SYS normalmente é arquivo de sistema ou driver. Este é o tipo de arquivo em que curiosidade e botão Delete não deveriam trabalhar em equipe.",
    tmp: "TMP é temporário por definição. Ainda assim, vale verificar se algum programa está usando o arquivo agora.",
    log: "LOG registra eventos de um programa. Geralmente é descartável depois de um tempo, mas pode ser útil para diagnosticar problemas.",
    iso: "ISO é uma imagem de disco. Muitas ficam esquecidas depois da instalação, ocupando vários gigabytes com muita dignidade.",
    zip: "ZIP é um arquivo compactado. Se o conteúdo já foi extraído em outro lugar, talvez você esteja mantendo duas cópias por esporte.",
    rar: "RAR é um arquivo compactado. Se o conteúdo já foi extraído, vale conferir se esse pacote ainda tem motivo para continuar aqui.",
    "7z": "7Z é um arquivo compactado. Ótimo para guardar coisas, excelente também para esquecê-las por três anos.",
    json: "JSON guarda dados estruturados e configurações. É texto legível por humanos, o que não significa que seja seguro editar qualquer um deles.",
    db: "DB costuma ser banco de dados de algum aplicativo. Eu trataria como importante até provar o contrário.",
    sqlite: "SQLite é um banco de dados local. Aplicativos adoram guardar estado nele e depois fingir que ninguém deveria notar."
  };

  const base =
    explanations[ext] ??
    `${file.extension || "Este arquivo"} não tem uma regra especial minha ainda. Eu consigo mostrar tamanho, idade e localização sem fingir que sei mais do que sei.`;

  if (file.ageDays && file.ageDays >= 1095) {
    return `${base} E você não mexe nele há cerca de ${years(file.ageDays)} anos. Arqueologia digital também conta como hobby, aparentemente.`;
  }

  if (file.ageDays && file.ageDays >= 365) {
    return `${base} Ele está há mais de um ano sem ser modificado, então merece pelo menos uma conferida.`;
  }

  return base;
}

function LiviaPortrait({ mood }: { mood: Mood }) {
  const eyesClosed = mood === "happy" || mood === "celebrating";
  const narrowed = mood === "suspicious" || mood === "judging" || mood === "messy";
  const worried = mood === "worried";
  const surprised = mood === "surprised";
  const scanning = mood === "scanning";
  const mouth =
    worried ? "M 43 66 Q 50 60 57 66" :
    surprised ? "M 47 64 Q 50 69 53 64 Q 50 59 47 64" :
    narrowed ? "M 44 64 Q 50 67 56 63" :
    "M 43 63 Q 50 69 57 63";

  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`Lívia: ${mood}`}>
      <defs>
        <linearGradient id="livia-hair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0eaff" />
          <stop offset=".5" stopColor="#c9b4ff" />
          <stop offset="1" stopColor="#8658ed" />
        </linearGradient>
        <linearGradient id="livia-jacket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#272239" />
          <stop offset="1" stopColor="#100d18" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" className="livia-portrait-bg" />
      <path d="M12 98c4-25 18-37 38-37s34 12 38 37" fill="url(#livia-jacket)" />
      <ellipse cx="50" cy="48" rx="28" ry="31" fill="#ffe7df" />
      <path d="M20 45C18 17 33 7 51 7c22 0 34 15 32 41-7-13-17-19-28-21-9 10-20 15-34 16z" fill="url(#livia-hair)" />
      <path d="M29 24c8 5 13 12 16 22 3-12 10-22 21-29-14 0-27 2-37 7z" fill="#ddcffd" />
      <path d="M22 54c4 18 14 28 28 29 14-1 24-11 28-29-3 22-13 34-28 36-15-2-25-14-28-36z" fill="#9e72ef" opacity=".6" />

      {eyesClosed ? (
        <>
          <path d="M33 48q6 6 12 0M55 48q6 6 12 0" fill="none" stroke="#604077" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : narrowed ? (
        <>
          <path d="M32 49q7-4 13 0M55 49q7-4 13 0" fill="none" stroke="#67418b" strokeWidth="4" strokeLinecap="round" />
          <circle cx="40" cy="50" r="2.5" fill="#d9caff" />
          <circle cx="62" cy="50" r="2.5" fill="#d9caff" />
        </>
      ) : (
        <>
          <ellipse cx="39" cy="49" rx={surprised ? 6 : 5} ry={surprised ? 8 : 7} fill="#6f3ce3" />
          <ellipse cx="62" cy="49" rx={surprised ? 6 : 5} ry={surprised ? 8 : 7} fill="#6f3ce3" />
          <circle cx="41" cy="46" r="2" fill="white" />
          <circle cx="64" cy="46" r="2" fill="white" />
        </>
      )}

      <path d={mouth} fill="none" stroke="#a44f72" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M26 40q8-5 17-2M56 38q9-3 17 2" fill="none" stroke="#4e3a61" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M25 20l-8-8 11-3z" fill="none" stroke="#a77bff" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="29" cy="76" r="10" fill="#15111f" stroke="#9062ec" strokeWidth="2.5" />
      <circle cx="71" cy="76" r="10" fill="#15111f" stroke="#9062ec" strokeWidth="2.5" />
      <path d="M26 72l3 7 4-7zM68 72l3 7 4-7z" fill="none" stroke="#bea3ff" strokeWidth="1.7" />
      <path d="M36 70q14-9 28 0" fill="none" stroke="#322842" strokeWidth="4" strokeLinecap="round" />

      {scanning ? <path className="livia-scan-line" d="M16 40h68" stroke="#b99bff" strokeWidth="1.5" /> : null}
      {worried ? <path d="M79 29q7-8 9 2" fill="none" stroke="#8dd7ff" strokeWidth="2" strokeLinecap="round" /> : null}
      {mood === "celebrating" ? (
        <g fill="#c8adff">
          <path d="M13 28l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M82 18l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
        </g>
      ) : null}
      {mood === "messy" ? <path d="M78 24q10-8 7 5q8-2 5 6" fill="none" stroke="#b18af8" strokeWidth="2" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function LiviaAssistant({
  busy = false,
  browsing = false,
  error,
  progress,
  report,
  selectedFile,
  duplicateBusy = false,
  duplicateReport
}: Props) {
  const [open, setOpen] = useState(false);

  const state = useMemo<AssistantState>(() => {
    if (error) {
      return {
        mood: "worried",
        title: "Isso não saiu como planejado",
        message: `${error} Nada de sair apagando coisa para “resolver”. Eu prefiro diagnóstico a ritual de sacrifício.`,
        key: `error:${error}`
      };
    }

    if (busy) {
      const count = progress?.filesScanned ?? 0;
      return {
        mood: "scanning",
        title: "Estou analisando",
        message: count
          ? `Já passei por ${count.toLocaleString("pt-BR")} arquivos. Agora estou em ${shortPath(progress?.currentPath ?? progress?.root ?? "", 50)}.`
          : "Vou construir o índice primeiro. Depois disso a gente navega sem obrigar o disco a contar a própria vida de novo.",
        key: `scan:${Math.floor(count / 5000)}`
      };
    }

    if (duplicateBusy) {
      return {
        mood: "scanning",
        title: "Comparando conteúdo",
        message: "Agora é BLAKE3. Mesmo tamanho não basta, porque dois arquivos podem coincidir no peso sem serem gêmeos. Humanos também.",
        key: "duplicate-busy"
      };
    }

    if (selectedFile) {
      return {
        mood: "explaining",
        title: selectedFile.name,
        message: fileComment(selectedFile),
        key: `file:${selectedFile.path}`
      };
    }

    if (duplicateReport?.groups.length) {
      return {
        mood: "judging",
        title: "Tem repetição por aqui",
        message: `Confirmei ${duplicateReport.groups.length.toLocaleString("pt-BR")} grupos idênticos. Isso representa ${formatBytes(duplicateReport.reclaimableBytes)} potencialmente recuperáveis. Backup é ótimo. Clonagem sem propósito é outra conversa.`,
        key: `dupes:${duplicateReport.groups.length}:${duplicateReport.reclaimableBytes}`
      };
    }

    if (browsing) {
      return {
        mood: "suspicious",
        title: "Consultando o índice",
        message: "Calma, não estou varrendo o disco de novo. Estou só recortando o índice que já construí. Civilização, finalmente.",
        key: "browsing"
      };
    }

    if (report) {
      const reclaimable = report.recommendations.reduce((sum, item) => sum + item.size, 0);
      if (report.recommendations.length >= 8 || reclaimable >= 2 * 1024 * 1024 * 1024) {
        return {
          mood: "messy",
          title: "Tem coisa pedindo atenção",
          message: `Achei ${report.recommendations.length.toLocaleString("pt-BR")} itens para revisar, somando ${formatBytes(reclaimable)}. Eu não vou chamar de bagunça. Ainda.`,
          key: `messy:${report.root}:${report.recommendations.length}`
        };
      }

      return {
        mood: "happy",
        title: "Análise pronta",
        message: `${report.fileCount.toLocaleString("pt-BR")} arquivos indexados neste recorte. Agora pode clicar nas coisas à vontade sem me mandar passear pelo disco inteiro de novo.`,
        key: `report:${report.root}:${report.fileCount}`
      };
    }

    return {
      mood: "normal",
      title: "Oi. Eu sou a Lívia.",
      message: "Fico aqui no canto. Quando você analisar o disco, escolher um arquivo ou confirmar duplicatas, eu explico o que estiver acontecendo sem transformar a tela num carnaval de pop-ups.",
      key: "idle"
    };
  }, [busy, browsing, duplicateBusy, duplicateReport, error, progress, report, selectedFile]);

  useEffect(() => {
    if (state.key === "idle") return;
    setOpen(true);
    const timer = window.setTimeout(() => setOpen(false), selectedFile ? 11000 : 7500);
    return () => window.clearTimeout(timer);
  }, [selectedFile, state.key]);

  return (
    <aside className={`livia-assistant mood-${state.mood}`} aria-live="polite">
      {open ? (
        <div className="livia-bubble">
          <button className="livia-bubble-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar fala da Lívia">
            <X size={13} />
          </button>
          <span className="livia-bubble-kicker">LÍVIA</span>
          <strong>{state.title}</strong>
          <p>{state.message}</p>
        </div>
      ) : null}

      <button
        className="livia-avatar"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Fechar fala da Lívia" : "Abrir fala da Lívia"}
        title="Lívia"
      >
        <LiviaPortrait mood={state.mood} />
        <span className="livia-status-dot" aria-hidden="true" />
        {!open ? <MessageCircle className="livia-message-indicator" size={16} aria-hidden="true" /> : null}
      </button>
    </aside>
  );
}
