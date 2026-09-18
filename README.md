<div align="center">

<img src="docs/assets/livia-mark.svg" width="112" alt="L.I.V.I.A. logo" />

<img src="public/livia/livia-sprites.webp" width="480" alt="Lívia chibi em seis expressões: normal, feliz, explicando, julgando, preocupada e escaneando." />

# L.I.V.I.A.

### Leitura Inteligente e Visualização de Informações de Armazenamento

**Entenda o que ocupa seu disco, pesquise o índice inteiro e navegue sem ficar reescaneando a mesma árvore.**

![Windows](https://img.shields.io/badge/Windows-desktop-5969e8?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-20242c?style=flat-square)
![Rust](https://img.shields.io/badge/Rust-scanner-b7410e?style=flat-square)
![React](https://img.shields.io/badge/React-19-149eca?style=flat-square)
![Version](https://img.shields.io/badge/version-0.5.1--dev-5969e8?style=flat-square)

</div>

---

## Visão geral

A **L.I.V.I.A.** é um analisador de armazenamento local-first para Windows. Ela percorre pastas e unidades, organiza consumo por diretório e extensão, mostra os maiores arquivos e aponta itens que merecem revisão.

Na **v0.2.1**, a análise deixa de ser apenas um relatório descartável e passa a construir um **índice de sessão**. Busca, filtros e drill-down trabalham nesse índice em vez de obrigar o disco a reviver a mesma caminhada toda vez que o usuário clica numa pasta. Um conceito revolucionário conhecido como “não fazer trabalho duas vezes”.

## Conheça a Lívia

A interface agora tem uma personagem própria: **Lívia**, a cyber assistente que vive no canto do aplicativo e reage ao que está acontecendo sem interromper o trabalho.

Ela foi desenhada para ser útil antes de ser decorativa: cabelo lilás/prateado, olhos violeta, headset tecnológico e a mesma linguagem visual roxa do app. A personalidade é divertida, irônica e direta, mas as recomendações continuam conservadoras. A personagem pode fazer piada com a pasta Downloads; a aplicação continua sem autorização para fazer besteira no disco.

- **Analisando:** acompanha a varredura e mostra o progresso em linguagem humana.
- **Explicando:** ao selecionar arquivos como DLL, PAK, ISO, SYS, ZIP ou JSON, explica o que aquele tipo normalmente representa.
- **Julgando com carinho:** comenta arquivos muito antigos e duplicatas confirmadas.
- **Contextual:** usa os assets oficiais **Normal, Feliz, Explicando, Julgando, Preocupada e Escaneando** conforme o estado do aplicativo.
- **Não intrusiva:** o avatar fica no canto; o balão pode ser fechado e reaparece apenas em eventos relevantes.
- **Seguro por design:** nenhuma fala da Lívia transforma sugestão em exclusão automática.

### Assets oficiais da personagem

A tira acima é a fonte visual usada pelo próprio aplicativo. Não existe mais uma “versão vetorial aproximada” da mascote: o avatar do canto usa os mesmos chibis aprovados, recortados como sprites.

| Estado visual | Uso principal |
| --- | --- |
| **Normal** | espera / início |
| **Feliz** | análise concluída sem grande alerta |
| **Explicando** | arquivo selecionado e explicações de extensão |
| **Julgando** | duplicatas, excesso de itens e comentários irônicos |
| **Preocupada** | erros e situações que pedem cautela |
| **Escaneando** | varredura do disco e confirmação por hash |


```mermaid
flowchart LR
    E[Evento na interface] --> C{Contexto}
    C -->|scan| S[Lívia analisando]
    C -->|arquivo selecionado| X[Lívia explicando]
    C -->|duplicatas confirmadas| D[Lívia julgando]
    C -->|erro| W[Lívia preocupada]
    C -->|resultado limpo| H[Lívia feliz]
    S --> B[Balão contextual opcional]
    X --> B
    D --> B
    W --> B
    H --> B
```

## Estado atual

| Recurso | Estado |
| --- | :---: |
| Scanner Rust responsivo | ✅ |
| Progresso e cancelamento | ✅ |
| Tema claro e escuro | ✅ |
| Guia contextual Lívia | ✅ v0.2.3 |
| Explicações por tipo de arquivo | ✅ v0.2.3 |
| Treemap interativo | ✅ |
| Pizza/Donut por pasta e extensão | ✅ v0.2.3 |
| Preferência de visualização persistente | ✅ v0.2.3 |
| Breadcrumb / drill-down | ✅ |
| Índice completo da sessão | ✅ v0.2.1 |
| Busca global no índice | ✅ v0.2.1 |
| Navegação sem nova varredura | ✅ v0.2.1 |
| MFT automático em raiz NTFS | ✅ experimental |
| Fallback seguro sem MFT | ✅ |
| Abrir arquivo no Explorer | ✅ |
| Triagem inicial de duplicatas | ✅ |
| Hash parcial + confirmação completa | ✅ v0.2.2 |
| Espaço recuperável confirmado | ✅ v0.2.2 |
| Limpeza assistida para a Lixeira | ✅ v0.3.0 |
| Desfazer seguro na sessão | ✅ v0.3.1 |
| Seleção assistida de duplicatas | ✅ v0.3.1 |
| Índice persistente entre execuções | ✅ v0.4.0 |
| Snapshots locais do armazenamento | ✅ v0.4.0 |
| Atualização incremental via USN Journal | ✅ v0.4.1 |
| Histórico visual do armazenamento | ✅ v0.5.0 |
| Crescimento por pasta e extensão | ✅ v0.5.0 |
| Recomendações explicáveis | ✅ v0.5.1 |
| Evidência, confiança, risco e impacto | ✅ v0.5.1 |
| Android | 🗓️ Futuro |

## v0.2.1 — Index & Search

### Entregas

- [x] indexar todos os arquivos encontrados durante a análise;
- [x] manter o índice somente na sessão;
- [x] pesquisa global por nome ou caminho;
- [x] filtros por extensão e tamanho sobre o índice completo;
- [x] ordenação no backend;
- [x] drill-down pelo treemap sem nova leitura física;
- [x] breadcrumb usando o mesmo índice;
- [x] painel informa quantos arquivos estão indexados;
- [x] tentativa automática de enumeração NTFS/MFT ao analisar a raiz de uma unidade;
- [x] fallback transparente para o scanner compatível quando MFT não puder ser usado;
- [x] README atualizado;
- [x] validar CI Windows;
- [x] validar instalador;
- [x] publicar v0.2.1.

### MFT e privilégios

O caminho acelerado usa enumeração da **Master File Table** quando a análise parte da raiz de uma unidade NTFS e o processo possui privilégios suficientes.

O acesso direto à MFT no Windows requer elevação. A L.I.V.I.A. **não se autoeleva** e não força UAC. Se o acesso não estiver disponível, a análise continua com o scanner convencional e informa o fallback na interface.

Isso é intencional: pedir permissão administrativa automaticamente só para parecer rápido seria uma maneira impressionante de piorar ainda mais a primeira impressão de um aplicativo que já precisa lidar com SmartScreen.

## v0.2.2 — Duplicatas confiáveis

A verificação de duplicatas agora acontece **sob demanda**. A indexação inicial continua leve: primeiro os candidatos são agrupados por tamanho, depois a L.I.V.I.A. calcula um hash BLAKE3 de amostras do início e do fim dos arquivos e só lê o conteúdo inteiro dos grupos que continuam iguais.

### Entregas

- [x] agrupar candidatos em todo o índice pelo tamanho exato;
- [x] ignorar arquivos menores que 1 MB para evitar ruído;
- [x] hash parcial BLAKE3 com amostras de 64 KiB do início e do fim;
- [x] hash completo apenas nos candidatos que sobrevivem à triagem;
- [x] rejeitar arquivos cujo tamanho mudou desde a indexação;
- [x] mostrar progresso da verificação na interface;
- [x] mostrar grupos confirmados e espaço potencialmente recuperável;
- [x] manter a operação estritamente somente leitura;
- [x] validar CI Windows e instalador;
- [x] publicar v0.2.2.

### Fluxo da confirmação

```mermaid
flowchart LR
    I[Índice da sessão] --> S[Agrupar por tamanho]
    S --> P[BLAKE3 parcial]
    P -->|não bate| D[Descartar candidato]
    P -->|bate| F[BLAKE3 completo]
    F -->|hash diferente| D
    F -->|hash igual| C[Duplicata confirmada]
    C --> R[Calcular espaço recuperável]
```

Nenhum arquivo é removido nesta fase. A L.I.V.I.A. só prova que os conteúdos são iguais e mostra onde eles estão. Humanos continuam responsáveis pelo botão destrutivo, uma tradição que estranhamente ainda faz sentido.

## v0.2.4 — Hotfix da Lívia

A v0.2.4 corrige um problema de empacotamento do asset da personagem: o arquivo WebP da sprite sheet havia sido publicado incompleto, então GitHub e aplicativo reservavam o espaço da imagem, mas não conseguiam decodificá-la.

### Correções

- [x] republicar a sprite sheet da Lívia como WebP válido;
- [x] restaurar a personagem no avatar do aplicativo;
- [x] restaurar a tira de expressões no README;
- [x] manter os estados **Normal, Feliz, Explicando, Julgando, Preocupada e Escaneando**;
- [x] validar o asset antes da release;
- [x] validar CI Windows e instalador;
- [x] publicar v0.2.4.

## v0.2.3 — Visualizações + Lívia

A área de análise agora pode alternar entre visualizações sem recalcular o índice. O objetivo é permitir leitura detalhada e leitura rápida do mesmo conjunto de dados, porque aparentemente uma única forma de enxergar 191 GB de Steam não era humilhante o bastante.

### Entregas

- [x] alternância **Mapa / Pizza** para distribuição por pasta;
- [x] alternância **Lista / Pizza** para extensões;
- [x] gráfico donut responsivo usando Recharts;
- [x] legenda com porcentagem, tamanho e contagem de arquivos;
- [x] agrupamento de categorias menores em **Outros**;
- [x] navegação pelo índice clicando em fatias e itens de pasta;
- [x] preferência de visualização salva localmente;
- [x] suporte aos temas claro e escuro;
- [x] avatar persistente da Lívia no canto da interface;
- [x] estados visuais contextuais para análise, resultado, erro, duplicatas e seleção de arquivo;
- [x] balões opcionais que abrem em eventos relevantes e podem ser fechados;
- [x] explicações para tipos comuns como DLL, PAK, SYS, ISO, ZIP, JSON e bancos locais;
- [x] comentários contextuais para arquivos antigos e duplicatas confirmadas;
- [x] suporte responsivo e integração com os temas claro e escuro;
- [x] validar CI Windows e instalador;
- [x] publicar v0.2.3.

## v0.3.0 — Limpeza assistida

A L.I.V.I.A. agora sai do modo “eu só observo a bagunça” e passa a ajudar na limpeza sem ganhar um lança-chamas apontado para o sistema de arquivos.

### Fluxo seguro

- [x] adicionar arquivos individualmente à bandeja de limpeza;
- [x] revisar quantidade e espaço antes de qualquer ação;
- [x] exigir uma segunda confirmação;
- [x] conferir se o arquivo ainda pertence ao índice;
- [x] conferir novamente tamanho e tipo antes de mover;
- [x] preservar arquivos que mudaram desde a indexação;
- [x] bloquear a pasta do Windows e o executável atual;
- [x] mover para a Lixeira do sistema, nunca excluir permanentemente;
- [x] atualizar o índice em memória depois da operação;
- [x] manter histórico local resumido sem persistir caminhos de arquivos;
- [x] fazer a Lívia reagir à seleção, execução e conclusão da limpeza;
- [x] restauração direta pela interface com identificação segura na sessão (v0.3.1).

```mermaid
flowchart LR
    I[Índice da sessão] --> S[Usuário seleciona arquivos]
    S --> T[Bandeja de limpeza]
    T --> R[Revisão]
    R --> C[Segunda confirmação]
    C --> V{Validação backend}
    V -->|mudou / protegido| P[Preservar]
    V -->|válido| L[Lixeira do Windows]
    L --> U[Atualizar índice]
    U --> H[Histórico resumido]
```

## v0.3.1 — Desfazer seguro + revisão de duplicatas

A limpeza agora fecha o ciclo: a L.I.V.I.A. tenta identificar a **entrada exata** criada na Lixeira para cada arquivo movido. Quando essa identificação é inequívoca, a operação ganha um botão **Desfazer** durante a sessão atual.

Isso é deliberadamente conservador. Se a entrada não puder ser ligada com segurança ao arquivo que a L.I.V.I.A. acabou de mover, o aplicativo não inventa um vínculo só para poder exibir um botão bonito.

### Entregas

- [x] registrar a Lixeira antes e depois da limpeza para identificar somente itens novos;
- [x] vincular o item pelo identificador do sistema e pelo caminho original;
- [x] manter os identificadores da Lixeira somente em memória;
- [x] restaurar arquivos ao caminho original pela API da Lixeira;
- [x] tratar colisões/erros sem restaurar “o arquivo mais parecido”;
- [x] recolocar arquivos restaurados no índice atual quando ele ainda corresponde à mesma raiz;
- [x] histórico mais rico com movidos, preservados e restaurados;
- [x] histórico persistente continua sem caminhos ou identificadores da Lixeira;
- [x] botão **Selecionar cópias** em duplicatas confirmadas;
- [x] seleção em lote preserva explicitamente a primeira cópia da lista para revisão;
- [x] Lívia reage ao desfazer, à restauração concluída e à seleção assistida de duplicatas.

```mermaid
flowchart LR
    S[Seleção revisada] --> B[Snapshot da Lixeira]
    B --> T[Mover arquivos]
    T --> A[Listar Lixeira novamente]
    A --> M{Item novo + caminho original batem?}
    M -->|sim| U[Registrar Undo em memória]
    M -->|não| N[Sem desfazer automático]
    U --> R[Desfazer]
    R --> C{Restauração segura}
    C -->|ok| I[Recolocar no índice]
    C -->|colisão/erro| P[Manter item na Lixeira]
```

O desfazer é **ligado à sessão atual**. Ao fechar a aplicação, os identificadores do sistema operacional são descartados. O histórico resumido continua existindo, mas sem dados suficientes para executar uma restauração automática depois de reabrir o app. É menos mágico e muito menos irresponsável.

## v0.4.0 — Memória persistente + snapshots

A L.I.V.I.A. agora **lembra do último índice**. Depois de uma análise concluída, o índice completo fica salvo localmente e é restaurado na próxima abertura sem exigir uma nova varredura física.

Também é criado um snapshot resumido a cada nova indexação. Isso prepara o terreno para a comparação temporal das próximas releases.

### Entregas

- [x] persistência local do índice completo;
- [x] restauração automática do último índice na inicialização;
- [x] snapshots resumidos por raiz analisada;
- [x] até 60 snapshots locais por histórico;
- [x] snapshot registra tamanho, arquivos, pastas, engine e horário;
- [x] mini timeline no dashboard com os snapshots recentes;
- [x] delta de espaço em relação ao snapshot anterior;
- [x] limpeza e desfazer atualizam o índice persistente;
- [x] nenhum índice ou snapshot é enviado para fora do computador;
- [x] Lívia reconhece quando recuperou o armazenamento da memória local.

Os arquivos de estado ficam em `%LOCALAPPDATA%\L.I.V.I.A\state`. O índice é versionado por schema para que futuras mudanças possam invalidar formatos antigos sem interpretar lixo como verdade. Um luxo conhecido em alguns círculos como “não corromper os dados do usuário”.

```mermaid
flowchart LR
    S[Varredura completa] --> I[Índice em memória]
    I --> P[index-v1.json]
    S --> H[snapshots-v1.json]
    P --> A[Próxima abertura]
    A --> R[Restaurar índice sem varrer]
    H --> T[Mini timeline]
    R --> B[Busca / drill-down / limpeza]
```

## v0.4.1 — USN Journal + atualização incremental

Em unidades NTFS elegíveis, a L.I.V.I.A. agora salva um **checkpoint do USN Journal** junto do índice. Ao clicar em **Atualizar índice**, ela tenta ler apenas as alterações ocorridas desde esse checkpoint.

Se o journal tiver sido recriado, o checkpoint tiver expirado, houver mudança estrutural de diretório, o volume não permitir acesso ou o lote de mudanças ficar grande demais, a L.I.V.I.A. abandona a rota incremental e **reconstrói o índice completo automaticamente**. Nada de insistir numa otimização quando a premissa deixou de ser confiável. Seria muito humano.

### Entregas

- [x] checkpoint `journalId + nextUsn` salvo no índice persistente;
- [x] leitura incremental iniciando no último USN conhecido;
- [x] atualização/remoção apenas dos arquivos apontados pelo journal;
- [x] engine `NTFS / USN incremental` visível no relatório;
- [x] fallback automático para indexação completa;
- [x] fallback em alterações estruturais de diretório;
- [x] fallback quando o checkpoint sai da janela válida;
- [x] limite de segurança para lotes excessivos de eventos;
- [x] novo snapshot após cada atualização;
- [x] Lívia explica se a atualização foi incremental ou completa.

```mermaid
flowchart LR
    P[Índice persistente + checkpoint] --> Q[Consultar USN Journal]
    Q --> V{Checkpoint válido?}
    V -->|não| F[Reindexação completa]
    V -->|sim| C[Ler somente mudanças]
    C --> D{Mudança estrutural / ambígua?}
    D -->|sim| F
    D -->|não| U[Atualizar arquivos afetados]
    U --> N[Novo checkpoint]
    N --> S[Novo snapshot]
    F --> S
```

## v0.5.0 — Histórico visual do armazenamento

Os snapshots deixaram de ser apenas números guardados em algum JSON melancólico. A L.I.V.I.A. agora transforma a memória do disco em uma **linha do tempo visual**, com comparação de crescimento por pasta e extensão.

### Entregas

- [x] gráfico temporal de espaço ocupado;
- [x] filtros de 7 dias, 30 dias e histórico completo;
- [x] comparação entre o snapshot atual e o início do período;
- [x] variação de quantidade de arquivos;
- [x] breakdown resumido de até 20 pastas por snapshot;
- [x] breakdown resumido de até 20 extensões por snapshot;
- [x] ranking das pastas que mais cresceram ou diminuíram;
- [x] ranking dos tipos de arquivo que mais mudaram;
- [x] compatibilidade com snapshots antigos sem breakdown;
- [x] Lívia comenta crescimento ou redução desde a leitura anterior.

```mermaid
flowchart LR
    S[Snapshots locais] --> P[Filtro de período]
    P --> T[Linha do tempo]
    P --> B[Snapshot base]
    P --> A[Snapshot atual]
    B --> C[Comparação]
    A --> C
    C --> F[Crescimento por pasta]
    C --> E[Crescimento por extensão]
    C --> L[Insight da Lívia]
```

Snapshots anteriores à v0.5 continuam válidos. Eles aparecem no gráfico de tamanho total, mas só novos snapshots possuem breakdown detalhado por pasta e extensão. Inventar dados históricos que nunca foram coletados seria muito eficiente, pena que também seria mentira.

## v0.5.1 — Recomendações explicáveis

A L.I.V.I.A. parou de apresentar “limpe isso” como se uma regra heurística tivesse recebido um diploma. Cada recomendação agora mostra **por que apareceu**, qual é o risco, qual o impacto estimado e quanta confiança a regra tem naquele caso.

### Entregas

- [x] evidências visíveis por recomendação;
- [x] confiança percentual da regra;
- [x] risco **Baixo** ou **Revisar**;
- [x] impacto **Baixo**, **Médio** ou **Alto** baseado no espaço envolvido;
- [x] nota de segurança específica por categoria;
- [x] temporários do perfil com regra contextual;
- [x] logs antigos e grandes;
- [x] ISOs antigas;
- [x] compactados antigos;
- [x] instaladores antigos, com contexto extra em Downloads;
- [x] arquivos `.bak` e `.old` antigos;
- [x] arquivos enormes antigos ou excepcionalmente grandes;
- [x] Lívia explica a recomendação principal e sua confiança.

A confiança indica **o quanto os sinais combinam com a regra**, não a probabilidade de que o arquivo seja inútil. Um arquivo pode encaixar perfeitamente em “ISO antiga de 8 GB” e ainda ser a única mídia de recuperação do usuário. Por isso a limpeza continua dependendo de revisão humana.

```mermaid
flowchart LR
    F[Arquivo indexado] --> S[Sinais]
    S --> A[idade]
    S --> B[tamanho]
    S --> C[tipo]
    S --> D[local]
    A --> R[Regra explicável]
    B --> R
    C --> R
    D --> R
    R --> E[Evidências]
    R --> Q[Confiança]
    R --> K[Risco]
    R --> I[Impacto]
    E --> U[Revisão do usuário]
    Q --> U
    K --> U
    I --> U
    U --> L[Limpeza assistida]
```

## Arquitetura

```mermaid
flowchart LR
    U[Usuário] --> UI[React + TypeScript]
    UI -->|scan_path| T[Tauri 2]
    T --> D{Raiz de unidade?}
    D -->|sim| M[MFT / NTFS]
    D -->|não| W[WalkDir]
    M -->|sem privilégio / erro| W
    M --> IX[Índice de sessão]
    W --> IX
    IX --> S[Busca global]
    IX --> B[Browse instantâneo]
    IX --> R[Relatórios por caminho]
    UI --> L[Lívia contextual]
    IX --> L
    S --> UI
    B --> UI
    R --> UI
```

## Fluxo de navegação indexada

```mermaid
sequenceDiagram
    participant U as Usuário
    participant UI as Interface
    participant I as Índice Rust
    participant FS as Disco

    U->>UI: Indexar C:\
    UI->>FS: leitura inicial
    FS-->>I: metadados dos arquivos
    I-->>UI: ScanReport
    U->>UI: busca "iso"
    UI->>I: search_index()
    I-->>UI: resultados em memória
    U->>UI: entra em Users
    UI->>I: browse_index()
    I-->>UI: relatório do recorte
    Note over I,FS: sem nova varredura física
```

## Como a busca funciona

O índice armazena metadados de cada arquivo encontrado:

- caminho;
- nome;
- tamanho;
- extensão;
- data de modificação;
- idade calculada.

A interface pede ao backend somente os resultados necessários. O backend filtra o índice completo e devolve até 200 itens por consulta.

O índice não é persistido entre execuções ainda. Persistência incremental via USN Journal fica para uma fase posterior.

## Segurança

A análise, a busca, o MFT e a confirmação de duplicatas continuam **somente leitura**. Desde a v0.4.0, o índice e snapshots são persistidos localmente em arquivos de estado da própria L.I.V.I.A.; esses dados não saem do computador.

A partir da **v0.3.0**, existe uma ação explícita de limpeza assistida. Ela só opera sobre arquivos que o usuário selecionou, exige revisão e confirmação, valida novamente tamanho e tipo do arquivo antes da ação e usa a **Lixeira do sistema** em vez de exclusão permanente. Arquivos dentro da pasta do Windows e o executável atual da L.I.V.I.A. são bloqueados pelo backend.

Na **v0.3.1**, o desfazer só fica disponível quando a L.I.V.I.A. consegue correlacionar de forma inequívoca o arquivo movido com a entrada nova criada na Lixeira. O identificador dessa entrada fica apenas em memória e morre junto com a sessão.

O caminho MFT também é somente leitura. Se ele não estiver disponível, o aplicativo não tenta “consertar” permissões, não altera políticas do Windows e não cria serviço privilegiado.

### SmartScreen

As builds ainda não possuem assinatura Authenticode com certificado confiável. O Windows pode exibir **Fornecedor desconhecido** até que a distribuição passe a ser assinada.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Desktop | Tauri 2 |
| Scanner compatível | Rust + WalkDir |
| Scanner acelerado | NTFS MFT via Windows |
| Índice | memória da sessão |
| Interface | React 19 + TypeScript |
| Visualização | Recharts |
| CI / Release | GitHub Actions |

## Desenvolvimento

```bash
npm install
npm run tauri dev
```

Build Windows:

```bash
npm run tauri build
```

## Roadmap

```mermaid
flowchart TD
    A[v0.1 Fundação] --> B[v0.1.1 Scan responsivo]
    B --> C[v0.1.2 Polish + Themes]
    C --> D[v0.2 Explorer]
    D --> E[v0.2.1 Índice + MFT + busca global]
    E --> F[v0.2.2 Duplicatas por hash]
    F --> V[v0.2.3 Visualizações + Lívia]
    V --> G[v0.3 Limpeza assistida]
    G --> U[v0.3.1 Undo seguro]
    U --> M[v0.4.0 Memória persistente]
    M --> H[v0.4.1 USN Journal]
    H --> V5[v0.5.0 Histórico visual]
    V5 --> R5[v0.5.1 Recomendações explicáveis]
    H --> I[v1.0 Distribuição assinada]
    E -. plataforma paralela .-> J[Android]
```

### v0.2.2 — Duplicatas confiáveis
- ✅ agrupamento global por tamanho;
- ✅ hash rápido parcial BLAKE3;
- ✅ confirmação por hash completo;
- ✅ cálculo confiável do espaço potencialmente recuperável.

### v0.2.3 — Visualizações + Lívia
- ✅ mapa/treemap interativo;
- ✅ gráficos de pizza/donut para pastas e extensões;
- ✅ troca de modo sem reindexação;
- ✅ preferências persistentes;
- ✅ Lívia como guia visual dentro do app;
- ✅ explicações contextuais de arquivos e reações por estado.

### v0.3 — Limpeza assistida
- ✅ seleção múltipla por bandeja de limpeza;
- ✅ prévia do espaço selecionado;
- ✅ Lixeira em vez de exclusão direta;
- ✅ validação do arquivo novamente antes de mover;
- ✅ proteção da pasta do Windows e do executável em uso;
- ✅ histórico local resumido das operações;
- ✅ v0.3.1: desfazer/restaurar quando a entrada exata da Lixeira puder ser identificada;
- ✅ v0.3.1: seleção assistida de cópias em grupos de duplicatas confirmadas.

### v0.4 — Persistência e mudanças
- snapshots locais;
- índice persistente;
- USN Journal para atualizar somente o que mudou;
- comparação de crescimento entre períodos.

### Android — futuro
- protótipo Tauri 2;
- Storage Access Framework;
- UI adaptada para toque;
- compartilhamento das regras de classificação compatíveis.

## Design

A referência visual contínua é o [Impeccable](https://impeccable.style/): ferramenta desktop primeiro, decoração depois, e nenhuma interface tentando ganhar prêmio por quantidade de cards.

## Licença

MIT.
