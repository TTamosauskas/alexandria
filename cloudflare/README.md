# Avaliações anônimas — Cloudflare Workers + D1

O Alexandria está hospedado no GitHub Pages, com notas armazenadas no banco Cloudflare D1.
O Worker está em **https://alexandria-ratings.thiago-gt.workers.dev**.

## Voto direto

Abaixo das categorias, cada documento tem cinco estrelas clicáveis. O visitante escolhe de 1 a 5 e o voto é enviado **imediatamente**, sem login, diálogo ou Turnstile.
O resultado apresenta média e quantidade de votos. Os resultados de busca são ordenados por média decrescente, com desempate por quantidade de votos; documentos sem votos ficam por último.

O navegador guarda um UUID aleatório em localStorage. A API só armazena HMAC-SHA-256 desse identificador, usando o segredo `VOTER_HASH_SECRET`. Votar novamente no mesmo livro no mesmo navegador **substitui a nota anterior**.
O banco e os votos existentes são preservados. Nem nome nem e-mail são pedidos.

**Importante:** a validação antirobôs foi removida a pedido do responsável. O identificador local não garante uma pessoa = um voto: é possível gerar novas identidades, automatizar requisições ou manipular as médias. O cabeçalho Origin/CORS limita o uso normal por outros sites, **mas não impede solicitações programáticas com cabeçalhos forjados**. Mantemos somente validação de dados e identidade anônima para atualização do próprio voto.

## Configuração já existente

- Banco: `alexandria-ratings`, identificador registrado em `cloudflare/wrangler.jsonc`.
- Segredos do GitHub Actions: `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`.
- Segredo privado do Worker: `VOTER_HASH_SECRET`; não o substitua, pois isso mudaria a identificação dos votos antigos.
- A chave Turnstile anterior não é mais utilizada pelo Worker nem pelo frontend. Ela pode ser revogada na Cloudflare por quem administra a conta, mas não é necessário modificá-la para que o voto direto funcione.

Não inclua credenciais no repositório. O workflow de deploy roda na branch `feature/direct-star-voting` e utiliza os segredos cadastrados no GitHub.

## Publicação e verificação

O fluxo `.github/workflows/deploy-cloudflare-ratings.yml` aplica migrações D1 e publica a API; ele não altera o GitHub Pages. O frontend só deve ir à `main` **depois** de publicar a API.

Após o deploy, `GET /api/health` deve responder:

```json
{"ok":true,"voting":"direct"}
```

`GET /api/ratings` mostra o vetor de livros avaliados. `POST /api/ratings` aceita JSON com `bookId` (64 hexadecimais), `visitorId` (UUID v4), e `score` (inteiro entre 1 e 5). Não é exigido token Turnstile. O servidor exige `Origin: https://ttamosauskas.github.io`, para limitar chamadas pelo navegador no contexto do site.

Para testes locais, dentro de `cloudflare/`:

```bash
npm test
python3 test/check_migration.py
```

O workflow `ratings-api-smoke.yml` valida a API pública sem registrar votos fictícios. A primeira avaliação real deve ser feita no navegador com o site público.

[Documentação oficial — implantação GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).


## Histórico global das últimas pesquisas

O endereço \`https://ttamosauskas.github.io/alexandria/#editor\` exibe as **últimas 500 pesquisas explícitas** feitas na biblioteca. Os links recuperam exatamente os termos, categorias e idioma usados. Pesquisas executadas pelo formulário, pelas sugestões ou pelo clique em categoria são registradas; a navegação pelo histórico do navegador e atualizações da página não criam entradas duplicadas.

O frontend envia apenas \`query\`, \`category\` e \`language\`. A API armazena também ID incremental e data/hora. **Não** registra IP, login, identificador de visitante ou cookies para o histórico. O \`GET /api/search-history\` devolve a lista em ordem decrescente de registro e \`POST /api/search-history\` grava uma pesquisa válida. A migração \`0002_search_history.sql\` utiliza trigger D1/SQLite para eliminar automaticamente todas as entradas além das 500 mais recentes, sem alterar os votos.

**Aviso de privacidade:** \`#editor\` é um endereço público, não protegido por senha. Pessoas que descobrirem o endereço poderão ler as pesquisas, que podem conter dados digitados pelos visitantes. O site informa antes da busca que as consultas podem aparecer nesse histórico público. Para uma página restrita seria necessária autenticação independente, nunca apenas um hash de URL.


## Sinalizações de copyright

A Biblioteca Oculta oferece, em cada resultado, o botão 📢 ("denunciar uso indevido"), que só fica visível ao passar o ponteiro sobre o resultado, focar pelo teclado ou tocar em uma região não interativa do cartão. O formulário coleta somente em memória do navegador dados exigidos para gerar uma notificação de copyright/DMCA: identificação do reclamante e do trabalho protegido, endereço, telefone, e-mail, explicação, declarações de boa-fé e sob pena de perjúrio, e assinatura. O usuário **copia o texto e o envia por conta própria** para `info@archive.org`. O site não envia e-mails nem armazena quaisquer desses dados pessoais.

Depois de enviar o e-mail, o usuário pode clicar em **"Já enviei o e-mail: registrar link sinalizado"**. Isso registra somente URL do PDF, título e data em `reported_links` (migração `0003_reported_links.sql`). A mesma URL não é duplicada. A área `#editor` apresenta esses links em uma **segunda lista**, rotulada **"Links sinalizados por visitantes — não verificados"**. Uma sinalização **não comprova violação de direitos autorais** nem que o e-mail foi enviado ou aceito pelo Archive.org.

A API oferece `GET /api/reported-links` e `POST /api/reported-links`. Como o sistema não exige login, a marcação de envio depende da declaração do visitante e pode ser usada indevidamente; somente o Archive.org avalia o mérito e eventual remoção.

As orientações para a notificação foram conferidas no [post fornecido do Archive.org](https://archive.org/post/1026511/email-address-to-send-removal-request) e na [política de direitos do Archive.org](https://archivesupport.zendesk.com/hc/en-us/articles/360014759692-Rights).
