# L.I.V.I.A.

**Leitura Inteligente e Visualização de Informações de Armazenamento**

L.I.V.I.A. é um aplicativo desktop local-first para entender o que ocupa espaço no computador sem transformar a análise em uma planilha com crise de identidade.

A referência de problema é o WizTree. A proposta é preservar a utilidade de uma análise de disco rápida, mas com uma interface contemporânea, progresso visível e recomendações conservadoras.

## Versão atual

### v0.1.1 — Responsive Scan

A v0.1.1 corrige os principais problemas encontrados no primeiro teste real:

- análise executada fora da thread da interface;
- janela continua respondendo enquanto o disco é percorrido;
- progresso ao vivo com arquivos, pastas, bytes, tempo e caminho atual;
- cancelamento de análise;
- consumo de memória reduzido: os maiores arquivos são mantidos em estrutura limitada em vez de guardar todos os arquivos em memória;
- varredura fica restrita ao mesmo sistema de arquivos da unidade selecionada, evitando atravessar pontos de montagem;
- limite maior de diretórios abertos para reduzir gargalos de travessia;
- acesso direto ao disco do sistema;
- interface refeita como utilitário desktop, sem hero de landing page;
- título da janela revisado;
- novo ícone da L.I.V.I.A.;
- recomendações continuam somente leitura.

## O que a L.I.V.I.A. mostra

- espaço total encontrado;
- quantidade de arquivos e pastas;
- diretórios de primeiro nível que mais pesam;
- distribuição por extensão;
- maiores arquivos;
- itens antigos, temporários, instaladores e arquivos muito grandes que merecem revisão;
- entradas inacessíveis ignoradas com segurança.

## Segurança

A L.I.V.I.A. **não exclui arquivos** nesta fase.

O scanner lê metadados localmente e o motor de recomendação evita sugerir itens em áreas sensíveis conhecidas do Windows.

### Windows SmartScreen

As builds públicas atuais ainda **não possuem assinatura Authenticode com certificado de code signing**. Por isso o Windows pode exibir “Fornecedor desconhecido” e o SmartScreen pode pedir confirmação em instalações novas.

Esse aviso é diferente de uma detecção técnica de malware, mas a experiência é ruim e a assinatura do executável está no roadmap antes da versão estável. Não será usado certificado autoassinado para maquiar o problema: a meta é assinatura confiável e verificável.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Desktop | Tauri 2 |
| Scanner | Rust |
| Interface | React 19 + TypeScript |
| Build | Vite |
| Visualização | Recharts |
| CI / Release | GitHub Actions |

## Desenvolvimento local

Pré-requisitos: Node.js 20+, Rust stable, Microsoft C++ Build Tools e WebView2 Runtime.

```bash
npm install
npm run tauri dev
```

Para gerar o instalador:

```bash
npm run tauri build
```

## Arquitetura

```text
L.I.V.I.A.
├─ src/                    # Interface React
│  ├─ components/
│  ├─ lib/
│  └─ App.tsx
├─ src-tauri/
│  ├─ src/scanner.rs       # Scanner e agregação
│  ├─ src/lib.rs           # Comandos, estado e eventos Tauri
│  └─ capabilities/
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ DESIGN.md
│  └─ PRODUCT.md
└─ .github/workflows/
```

## Roadmap

### 0.1.1 — Robustez e UX
- [x] scanner fora da thread da interface;
- [x] progresso ao vivo;
- [x] cancelamento;
- [x] memória limitada para ranking de maiores arquivos;
- [x] visual redesenhado;
- [x] novo ícone;
- [x] README atualizado.

### 0.2 — Scanner e análise
- [ ] benchmark em discos grandes;
- [ ] scanner NTFS especializado usando MFT para unidades compatíveis;
- [ ] filtros e busca;
- [ ] duplicatas;
- [ ] análise dedicada de caches e temporários;
- [ ] score configurável de confiança e risco.

### 0.3 — Limpeza assistida
- [ ] seleção múltipla;
- [ ] prévia do espaço recuperável;
- [ ] lixeira em vez de exclusão direta;
- [ ] histórico das ações;
- [ ] desfazer quando tecnicamente possível.

### 1.0 — Distribuição confiável
- [ ] assinatura Authenticode com certificado confiável;
- [ ] atualização automática;
- [ ] benchmarks publicados;
- [ ] política de segurança e releases verificáveis.

### Android — futuro
- [ ] protótipo Tauri 2 para Android;
- [ ] adaptar a análise ao Storage Access Framework e às restrições de armazenamento do Android;
- [ ] interface responsiva para toque;
- [ ] compartilhar regras de classificação com o core quando a plataforma permitir.

O Android fica depois de estabilizar o scanner Windows. O modelo de permissões e armazenamento é diferente, então não será uma cópia preguiçosa do executável desktop.

## Design

A referência visual contínua é o [Impeccable](https://impeccable.style/). A interface deve se comportar como ferramenta técnica: hierarquia clara, linguagem concreta, densidade desktop e nenhuma decoração competindo com os dados.

## Licença

MIT.
