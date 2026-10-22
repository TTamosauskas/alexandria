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
