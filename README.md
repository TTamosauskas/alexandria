# Biblioteca Oculta

Agregador estático de PDFs públicos do [Archive.org](https://archive.org/) para pesquisa em português, inglês e espanhol. A interface é publicada no GitHub Pages; avaliações anônimas usam Cloudflare Workers e D1.

## Recursos

- **Pesquisa inteligente:** sugestões de títulos ao digitar, acentos ignorados, busca por título, autor e assunto, pequenas correções de digitação e sinônimos controlados (por exemplo, *cabala*, *kabbalah* e *qabalah*). Os termos encontrados são destacados nos títulos.
- **Minha estante:** favoritos e até 40 PDFs vistos recentemente, mantidos exclusivamente no armazenamento local do navegador. Não há login ou sincronização entre dispositivos. É possível guardar até 500 favoritos. Limpar os dados do navegador apaga a estante.
- **Qualidade e desempenho:** registros carregados em lotes, resultados renderizados 24 por vez, busca indexada em memória por idioma e contador do acervo calculado dos três manifestos. A auditoria verifica quantidade de registros, URLs, duplicações e metadados; pode conferir uma amostra de links do Archive.org sem excluir arquivos automaticamente.
- **Avaliação de 1 a 5 estrelas:** um clique registra um voto anônimo; o navegador pode atualizar a própria nota. As médias visíveis são arredondadas para cima e as contagens não aparecem no layout. Os dados reais permanecem no D1. Sem Turnstile, não há garantia de um voto por pessoa.

## Catálogos

Os arquivos estão em `data/catalog/`, `data/catalog-en/` e `data/catalog-es/`. Os manifestos registram totais e versões, usados diretamente pelo contador da página. O carregador adiciona a propriedade de idioma a cada registro. Para atualizar os arquivos portugueses a partir de um JSON validado:

```bash
node scripts/split-catalog.mjs caminho/para/catalog.json
```

A ordenação da busca leva em conta a nota real, desempata pela quantidade de votos e, em seguida, pelo título. O cálculo de identificadores SHA-256 é feito somente para resultados relevantes, não para todo o acervo a cada busca.

## Testes e auditoria

```bash
npm test
npm run audit
node scripts/audit-catalog.mjs --check-links --sample=24
```

O relatório é gravado em `reports/catalog-quality.json` (ignorado pelo Git). URLs duplicadas ou possivelmente indisponíveis são sinalizadas, mas **nunca são apagadas automaticamente**, pois o Archive.org pode impor bloqueios temporários e limites de acesso.

O workflow [Qualidade do catálogo](.github/workflows/catalog-quality.yml) verifica a integridade quando os catálogos mudam e executa uma amostra de links semanalmente. Os relatórios podem ser baixados nos artefatos do GitHub Actions.

## Estrutura

- `index.html` e `assets/css/main.css`: interface responsiva.
- `assets/js/app.js`: busca, navegação, paginação, sugestões e estante.
- `assets/js/catalog.js`: carregamento dos manifestos e registros.
- `assets/js/search.js`: busca, correção, sinônimos, sugestões e destaque.
- `assets/js/shelf.js`: favoritos e histórico locais.
- `assets/js/ratings.js` e `cloudflare/`: avaliações anônimas e Worker.

Para executar localmente, sirva a raiz por HTTP. Não abra `index.html` diretamente usando `file://`.
