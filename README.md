# L.I.V.I.A.

**Leitura Inteligente e Visualização de Informações de Armazenamento**

L.I.V.I.A. é um aplicativo desktop para Windows que transforma o armazenamento do computador em informação útil: mostra o que está ocupando espaço, destaca arquivos e pastas relevantes e sugere itens que merecem revisão sem tratar “arquivo velho” como sinônimo de “lixo”.

A referência de problema é o WizTree. A proposta da L.I.V.I.A. é manter a utilidade de uma análise rápida de disco, mas com uma interface contemporânea, leitura mais clara e uma camada de recomendações explicáveis.

## 0.1 — Fundação

- aplicativo desktop real com **Tauri 2**;
- frontend em **React 19 + TypeScript**;
- varredura recursiva feita em **Rust**;
- seleção nativa de pasta ou unidade;
- total ocupado, arquivos, diretórios ignorados e tempo de análise;
- maiores arquivos encontrados;
- distribuição de espaço por extensão;
- treemap das áreas que mais ocupam espaço;
- recomendações iniciais por tamanho, idade e tipo;
- áreas sensíveis do Windows protegidas das recomendações;
- CI para Windows e workflow de release.

## Segurança primeiro

A 0.1 **não apaga arquivos**.

A aplicação lê somente metadados necessários para a análise e mantém tudo local. O motor de recomendação evita caminhos sensíveis do sistema. Quando a limpeza assistida chegar, ações destrutivas continuarão separadas por nível de risco e exigirão confirmação explícita.

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

Para gerar o executável/instalador:

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
│  ├─ src/scanner.rs       # Motor de análise
│  ├─ src/lib.rs           # Ponte Tauri
│  └─ capabilities/
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ DESIGN.md
│  └─ PRODUCT.md
└─ .github/workflows/
```

## Roadmap

### 0.1
- [x] shell desktop Tauri;
- [x] seleção de pasta;
- [x] scanner recursivo em Rust;
- [x] maiores arquivos;
- [x] distribuição por extensão;
- [x] treemap;
- [x] recomendações iniciais;
- [x] CI e release Windows;
- [x] validar build no runner Windows;
- [ ] benchmark em discos grandes.

### 0.2
- [ ] filtros e busca;
- [ ] duplicatas;
- [ ] análise dedicada de caches e temporários;
- [ ] score de confiança e risco;
- [ ] configuração das regras de recomendação.

### 0.3
- [ ] seleção múltipla;
- [ ] prévia do espaço recuperável;
- [ ] lixeira em vez de exclusão direta;
- [ ] histórico das ações;
- [ ] desfazer quando tecnicamente possível.

## Versão atual

**v0.1.0 — Foundation**

A primeira versão funcional já possui scanner local em Rust, visualização de armazenamento e recomendações somente leitura. O build Windows é validado no GitHub Actions antes de cada merge.

## Design

As regras visuais ficam em [docs/DESIGN.md](docs/DESIGN.md). O projeto usa o vocabulário e as heurísticas do [Impeccable](https://impeccable.style/) como referência contínua para evitar padrões genéricos de interface gerada por IA.

## Licença

MIT.
