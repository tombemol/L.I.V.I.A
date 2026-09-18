# Arquitetura

## Princípio central

A L.I.V.I.A. é local-first. O frontend não percorre o sistema de arquivos diretamente. Toda leitura passa pelo core Rust, que devolve ao React somente um relatório serializável.

## Fluxo

1. O usuário escolhe uma pasta ou unidade pelo diálogo nativo.
2. O React chama o comando Tauri `scan_path`.
3. O scanner Rust percorre o caminho com `walkdir`.
4. Apenas metadados necessários são coletados: caminho, tamanho, extensão e data de modificação.
5. O scanner agrega:
   - espaço total;
   - maiores arquivos;
   - uso por extensão;
   - uso por diretório de primeiro nível;
   - recomendações conservadoras.
6. O relatório é enviado ao frontend em uma única resposta.
7. O frontend organiza a informação visualmente.

## Limites da 0.1

A implementação inicial privilegia clareza e segurança em vez de performance extrema. WizTree consegue velocidade excepcional aproveitando estruturas específicas do NTFS. A L.I.V.I.A. 0.1 usa uma travessia convencional e portátil pelo Windows.

Uma fase posterior pode introduzir um scanner NTFS especializado atrás da mesma interface de domínio, sem acoplar a UI ao mecanismo.

## Segurança

O motor de recomendação não sugere itens em diretórios protegidos conhecidos, incluindo Windows, Program Files, ProgramData e System Volume Information.

A 0.1 não possui comando de exclusão.

## Evolução prevista

- scanner concorrente;
- leitura especializada de NTFS/MFT;
- cancelamento e progresso incremental;
- persistência local de snapshots;
- detecção de duplicatas por tamanho + hash;
- regras configuráveis de limpeza;
- lixeira e histórico.
