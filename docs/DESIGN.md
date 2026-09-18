# DESIGN

A referência de vocabulário e crítica da L.I.V.I.A. é o **Impeccable**: https://impeccable.style/

## Direção

**Utilitário técnico denso, calmo e nativo.**

O primeiro teste da 0.1 mostrou um problema claro: a tela inicial parecia uma landing page dentro de uma janela desktop. A partir da 0.1.1 isso é explicitamente proibido.

## Hierarquia

### Estado inicial
1. nome do utilitário;
2. ação de analisar o disco do sistema;
3. alternativa para escolher outro local;
4. informação de segurança.

### Durante a análise
1. caminho sendo analisado;
2. progresso operacional;
3. métricas ao vivo;
4. caminho atual;
5. cancelar.

### Resultado
1. local analisado e total encontrado;
2. resumo;
3. distribuição;
4. recomendações;
5. maiores arquivos.

## Regras

- títulos de produto devem ser concretos, não slogans;
- nenhum hero de 60–70 px em uma ferramenta desktop;
- uma ação primária por contexto;
- superfícies grandes e poucas;
- listas e divisores quando a informação é operacional;
- no máximo 6–8 px de raio em componentes comuns;
- ciano é acento, não tinta para a tela inteira;
- animação somente para progresso e feedback;
- nenhuma decoração deve competir com o dado;
- ícones precisam comunicar função.

## Evitar

- card dentro de card;
- status-chip soup;
- gradientes decorativos;
- glassmorphism;
- glow;
- headline de startup;
- texto “inteligente” que não explica uma ação;
- números duplicados;
- botões concorrendo pela mesma prioridade;
- tela vazia com espaço desperdiçado só para parecer “premium”.

## Cor

- fundo: `#090d11`;
- superfície: `#0f151b`;
- borda: `#24303a`;
- texto: `#edf3f5`;
- secundário: `#8594a0`;
- acento: `#5cc9dc`.

## Marca

O ícone combina:
- um **L** geométrico;
- blocos de armazenamento/treemap;
- fundo escuro;
- contraste suficiente para continuar legível em 16–32 px.

A marca não deve virar mascote nem logotipo ornamental. É um utilitário.

## Checklist

- a tela parece um aplicativo Windows ou uma landing page?
- a principal ação está óbvia?
- o usuário vê que o scan está vivo?
- existe cancelamento para operação longa?
- o texto descreve exatamente o que acontece?
- algum componente existe apenas para preencher espaço?
- a densidade faz sentido em 1280×720 e 1366×768?
