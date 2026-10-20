# Biblioteca Oculta

Interface estática para um catálogo de PDFs do Archive.org.

## Estrutura

- `index.html`: página da biblioteca.
- `assets/css/main.css`: aparência.
- `assets/js/`: busca e carregamento do catálogo.
- `data/catalog/`: índice JSON dividido em partes.
- `scripts/split-catalog.mjs`: atualiza o índice a partir de um `catalog.json` validado.

## Atualizar o catálogo

```bash
node scripts/split-catalog.mjs /caminho/para/catalog.json
```

Sirva os arquivos por HTTP durante o desenvolvimento, por exemplo com `python3 -m http.server`.
