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

type SpriteMood = "normal" | "happy" | "explaining" | "judging" | "worried" | "scanning";

type Props = {
  busy?: boolean;
  browsing?: boolean;
  error?: string | null;
  progress?: ScanProgress | null;
  report?: ScanReport | null;
  selectedFile?: FileEntry | null;
  duplicateBusy?: boolean;
  duplicateReport?: DuplicateReport | null;
  cleanupCount?: number;
  cleanupBusy?: boolean;
  lastCleanup?: { files: number; bytes: number } | null;
};

type AssistantState = {
  mood: Mood;
  title: string;
  message: string;
  key: string;
};

const spriteForMood: Record<Mood, SpriteMood> = {
  normal: "normal",
  scanning: "scanning",
  happy: "happy",
  surprised: "explaining",
  suspicious: "judging",
  judging: "judging",
  explaining: "explaining",
  worried: "worried",
  celebrating: "happy",
  messy: "judging"
};

function years(days: number) {
  return Math.max(1, Math.floor(days / 365));
}

function fileComment(file: FileEntry) {
  const ext = file.extension.toLocaleLowerCase("pt-BR").replace(/^\./, "");
  const explanations: Record<string, string> = {
    dll: "DLL é uma biblioteca compartilhada usada por outros programas. Apagar no impulso é uma forma eficiente de descobrir quantas coisas dependiam dela.",
    pak: "PAK costuma ser um pacote de recursos de jogos ou aplicativos. Pode guardar texturas, áudio, mapas e outros arquivos que o programa espera encontrar.",
    exe: "EXE é um executável do Windows. Pode ser instalador, programa ou ferramenta. Convém saber quem o usa antes de mexer.",
    sys: "SYS normalmente é arquivo de sistema ou driver. Curiosidade e botão Delete não deveriam trabalhar em equipe aqui.",
    tmp: "TMP é temporário por definição. Ainda assim, vale verificar se algum programa está usando o arquivo agora.",
    log: "LOG registra eventos de um programa. Costuma ser descartável depois de um tempo, mas também salva a dignidade de quem precisa diagnosticar um erro.",
    iso: "ISO é uma imagem de disco. Muitas ficam esquecidas depois da instalação, ocupando vários gigabytes com muita dignidade.",
    zip: "ZIP é um arquivo compactado. Se o conteúdo já foi extraído em outro lugar, talvez você esteja mantendo duas cópias por esporte.",
    rar: "RAR é um arquivo compactado. Se o conteúdo já foi extraído, vale conferir se esse pacote ainda tem motivo para continuar aqui.",
    "7z": "7Z é um arquivo compactado. Ótimo para guardar coisas, excelente também para esquecê-las por três anos.",
    json: "JSON guarda dados estruturados e configurações. É legível por humanos, o que não significa que seja seguro editar qualquer um deles.",
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
  const sprite = spriteForMood[mood];

  return (
    <span
      className={`livia-portrait livia-sprite-${sprite}`}
      aria-hidden="true"
    />
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
  duplicateReport,
  cleanupCount = 0,
  cleanupBusy = false,
  lastCleanup
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

    if (cleanupBusy) {
      return {
        mood: "worried",
        title: "Movendo para a Lixeira",
        message: "Estou validando os arquivos de novo antes de mover qualquer coisa. Se algo mudou desde a análise, eu preservo. Radical, eu sei.",
        key: "cleanup-busy"
      };
    }

    if (lastCleanup?.files) {
      return {
        mood: "celebrating",
        title: "Limpeza concluída",
        message: `${lastCleanup.files.toLocaleString("pt-BR")} arquivo(s) foram para a Lixeira, liberando até ${formatBytes(lastCleanup.bytes)}. Nada de exclusão permanente escondida atrás de botão bonito.`,
        key: `cleanup-done:${lastCleanup.files}:${lastCleanup.bytes}`
      };
    }

    if (cleanupCount > 0) {
      return {
        mood: "judging",
        title: "Bandeja de limpeza",
        message: `Você separou ${cleanupCount.toLocaleString("pt-BR")} arquivo(s). Eu só movo depois da revisão e de uma segunda confirmação. Sim, duas. Confiança é ótima; backups também.`,
        key: `cleanup-selected:${cleanupCount}`
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
        message: "Não estou varrendo o disco de novo. Estou só recortando o índice que já construí. Civilização, finalmente.",
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
  }, [
    busy,
    browsing,
    cleanupBusy,
    cleanupCount,
    duplicateBusy,
    duplicateReport,
    error,
    lastCleanup,
    progress,
    report,
    selectedFile
  ]);

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
          <button
            className="livia-bubble-close"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar fala da Lívia"
          >
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
        aria-label={open ? "Fechar fala da Lívia" : `Abrir fala da Lívia: ${state.title}`}
        title="Lívia"
      >
        <LiviaPortrait mood={state.mood} />
        <span className="livia-status-dot" aria-hidden="true" />
        {!open ? <MessageCircle className="livia-message-indicator" size={16} aria-hidden="true" /> : null}
      </button>
    </aside>
  );
}
