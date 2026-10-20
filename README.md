# Biblioteca Oculta

Agregador estático de PDFs de magia e ocultismo hospedados no Archive.org.

## Idiomas e catálogos

A pesquisa oferece quatro opções: português, inglês, espanhol e todas.
O catálogo português possui **7.109 livros**: foram excluídos 2.109 registros que tinham apenas a categoria `Outros Estudos e Documentos Esotéricos`. Outros 118 registros com categorias adicionais foram mantidos, removendo-se somente essa etiqueta.
O catálogo inglês começa com oito obras; o catálogo espanhol está preparado, mas ainda vazio.

- `data/catalog/`: português (manifesto e 19 partes existentes).
- `data/catalog-en/`: inglês (manifesto e partes).
- `data/catalog-es/`: espanhol (manifesto vazio).

O carregamento e o filtro usam o idioma **do catálogo**, não uma detecção automática do texto dos arquivos. Cada registro tem `identifier`, `title`, `creator`, `categories` e `pdf_url`. O carregador acrescenta o campo `language` conforme a pasta de origem.

Para ampliar inglês ou espanhol, inclua documentos de acesso público com links diretos ao PDF no Archive.org, atualize `parts` e `records` no manifesto e incremente `version` para evitar cache desatualizado. Respeite as permissões de uso de cada edição.

## Estrutura

- `index.html`: página, subtítulo, filtro de idioma e formulário.
- `assets/css/main.css`: aparência e responsividade.
- `assets/js/app.js`: busca, filtros, resultados, capas e paginação.
- `assets/js/catalog.js`: carregamento independente dos idiomas.
- `scripts/split-catalog.mjs`: refaz o catálogo português a partir de um JSON validado e impede a reinserção da categoria removida, preservando os registros com outras categorias.

## Atualizar o catálogo português

    node scripts/split-catalog.mjs /caminho/para/catalog.json

Durante o desenvolvimento, sirva o site por HTTP, por exemplo:

    python3 -m http.server

Abra `http://localhost:8000` em um navegador.
