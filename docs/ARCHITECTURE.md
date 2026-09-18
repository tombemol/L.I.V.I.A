# Arquitetura

## Princípio central

A L.I.V.I.A. é local-first. O frontend não percorre o sistema de arquivos diretamente. Toda leitura passa pelo core Rust e o React recebe somente progresso serializado e o relatório final.

## Fluxo de análise

1. O usuário escolhe o disco do sistema ou outro caminho.
2. O React chama o comando Tauri assíncrono `scan_path`.
3. O comando move a travessia pesada para `spawn_blocking`, fora da thread da interface.
4. O scanner Rust percorre o caminho com `walkdir`, sem seguir links e sem atravessar para outro sistema de arquivos.
5. Eventos `scan-progress` são emitidos durante a execução.
6. O frontend mostra arquivos, pastas, bytes, tempo e caminho atual.
7. O usuário pode chamar `cancel_scan`; o core encerra de forma cooperativa.
8. Ao terminar, o scanner devolve um `ScanReport`.

## Uso de memória

A v0.1.0 guardava todos os arquivos encontrados em um vetor para depois ordenar os maiores. Em uma unidade inteira isso poderia consumir muita memória.

A v0.1.1 mantém apenas os 40 maiores arquivos em uma heap limitada. Agregações por extensão e diretório usam mapas incrementais. Recomendações também são aparadas durante a análise.

O consumo cresce principalmente com o número de extensões e diretórios de primeiro nível, não com a quantidade total de arquivos.

## Performance

A 0.1.1 melhora responsividade e reduz pressão de memória, mas ainda usa travessia convencional do sistema de arquivos.

WizTree obtém grande parte de sua velocidade lendo estruturas específicas do NTFS. A próxima evolução de performance é um scanner NTFS/MFT especializado atrás do mesmo contrato de relatório, com fallback para a travessia atual.

## Segurança

- nenhum comando de exclusão existe;
- links não são seguidos;
- o scanner não atravessa outros sistemas de arquivos;
- caminhos sensíveis conhecidos não entram nas recomendações;
- erros de permissão são contabilizados e ignorados.

## Mobile

Tauri 2 permite um shell Android no futuro, mas o scanner desktop não pode ser transplantado diretamente. Android exige APIs como Storage Access Framework e obedece a permissões e escopos de armazenamento diferentes.

A camada de classificação e apresentação pode ser compartilhada onde fizer sentido; a coleta será específica por plataforma.
