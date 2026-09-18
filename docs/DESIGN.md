# DESIGN

Este documento registra as regras visuais da L.I.V.I.A. e deve ser consultado antes de mudanças relevantes na interface.

A referência de vocabulário e crítica é o **Impeccable**: https://impeccable.style/

## Direção

**Utilitário técnico calmo.**

A interface deve parecer uma ferramenta desktop séria, rápida e legível. Não um painel SaaS genérico e não uma demonstração de efeitos visuais.

## Hierarquia

1. Estado atual do disco/pasta e espaço analisado.
2. Onde o espaço está concentrado.
3. O que merece revisão.
4. Detalhes e listas.

Cada tela deve ter uma ação dominante. No estado vazio, a ação é escolher o local. Após a análise, a ação secundária é analisar outro local.

## Evitar

- card dentro de card;
- sopa de badges e chips;
- gradientes decorativos;
- brilho neon;
- glassmorphism;
- tipografia serifada “editorial” sem função;
- títulos vagos como “Unlock your potential”;
- quatro CTAs competindo;
- números repetidos em vários componentes;
- arredondamento exagerado;
- animação por decoração;
- ícones sem propósito;
- “AI beige” e aparência de template de startup.

## Forma

- raio principal: 6–8 px;
- bordas finas e discretas;
- superfícies poucas e grandes;
- tabelas e divisores usados quando a informação é tabular;
- densidade suficiente para aproveitar uma tela desktop.

## Cor

Paleta escura quase neutra.

- fundo: `#0a0d11`;
- superfície: `#10151b`;
- borda: `#25303a`;
- texto: `#eef2f4`;
- texto secundário: `#8c9aa7`;
- acento: ciano dessaturado, usado com parcimônia.

O acento não deve pintar todos os componentes. Serve para ação primária, foco e visualizações principais.

## Tipografia

Fonte de sistema. A hierarquia nasce de tamanho, peso, espaço e contraste, não de uma coleção de fontes.

- títulos grandes: tracking levemente negativo;
- títulos de seção: 16 px;
- corpo: 12–16 px;
- metadados: 10–11 px;
- labels curtas em caixa alta podem usar tracking maior.

## Movimento

Somente movimento funcional:

- loading;
- feedback de pressionamento;
- transições breves de hover/foco.

Nada deve pulsar para provar que está vivo.

## Conteúdo

Textos devem dizer exatamente o que a interface faz.

Preferir:
- “Escolher pasta ou unidade”
- “Arquivos que merecem uma olhada”
- “Nenhum arquivo é excluído nesta versão”

Evitar:
- “Comece sua jornada”
- “Libere seu potencial”
- “Insights inteligentes para você”

## Checklist de revisão

Antes de considerar uma tela pronta:

- existe uma ação visualmente dominante?
- os dados mais importantes aparecem primeiro?
- alguma informação está repetida?
- há card dentro de card?
- existe badge que poderia ser texto comum?
- o acento está sendo usado demais?
- a tela continua legível sem animação?
- a linguagem é concreta?
- um usuário entende o risco da ação?
- a interface parece um utilitário desktop, não um template?
