# Avaliações anônimas — Cloudflare Workers + D1

O Alexandria permanece no GitHub Pages. O Worker abaixo é uma API separada, responsável exclusivamente por votos e médias.

**Esta funcionalidade fica desativada até configurar os dois campos em `assets/js/ratings-config.js`.**
Nenhuma credencial secreta deve ser adicionada ao GitHub.

## O que é necessário na sua conta Cloudflare

1. Acesse https://dash.cloudflare.com/ com sua conta; se aplicável, entre com Google. Essa autenticação exige ação do titular.
2. Em **Turnstile**, crie um widget para o hostname `ttamosauskas.github.io`. Guarde:
   - **Site key**, que é pública e vai para o frontend.
   - **Secret key**, que é privada e será armazenada como segredo do Worker.
3. No terminal (Node.js instalado), a partir da pasta `cloudflare/` deste repositório:

   ```bash
   npx wrangler login
   npx wrangler d1 create alexandria-ratings
   ```

   O comando de criação informa um identificador UUID. Copie-o para o campo `database_id` do arquivo `wrangler.jsonc`, substituindo `REPLACE_WITH_D1_DATABASE_ID`.

4. Crie o esquema do banco remoto:

   ```bash
   npx wrangler d1 migrations apply alexandria-ratings --remote
   ```

5. Grave **dois segredos**, sem incluí-los em arquivos versionados:

   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put VOTER_HASH_SECRET
   ```

   Para o primeiro, cole a **Secret key** do Turnstile. Para o segundo, gere uma chave privada aleatória de no mínimo 32 bytes (por exemplo, `openssl rand -hex 32`). O segredo serve para calcular o HMAC do identificador do visitante, não deve ser mostrado em público.

   **Atenção:** ao criar segredos, Wrangler pode criar ou publicar um Worker inicial. Confira se a versão mais recente foi publicada após configurar banco e segredos.

6. Publique a API:

   ```bash
   npx wrangler deploy
   ```

   Ao final você verá um endereço como `https://alexandria-ratings.<subdominio>.workers.dev`. Esse é **apenas um exemplo**, não um endereço real.

7. Confira em seu navegador se `<ENDERECO_DO_WORKER>/api/health` retorna `{"ok":true}` e `/api/ratings` retorna `{"ratings":[]}` antes de registrar votos.

8. Preencha os **valores públicos** em `assets/js/ratings-config.js`:

   ```js
   export const RATINGS_CONFIG = Object.freeze({
     apiBaseUrl: "https://SEU-WORKER.workers.dev",
     turnstileSiteKey: "SUA_SITE_KEY_PUBLICA",
   });
   ```

   Ao publicar essa configuração no GitHub Pages, as estrelas e a ordenação serão ativadas. **Nunca copie** `TURNSTILE_SECRET` nem `VOTER_HASH_SECRET` para o frontend.

## Endpoints

- `GET /api/health` — indica se o D1 está vinculado (não prova que a migração foi aplicada).
- `GET /api/ratings` — devolve médias e totais de livros já avaliados.
- `POST /api/ratings` — recebe `bookId`, `score` de 1 a 5, `visitorId` e `token` Turnstile; valida o token no servidor e salva o voto.

O frontend gera `bookId` por SHA-256 de idioma e URL do PDF, garantindo chave estável. O servidor guarda só um HMAC do identificador anônimo do navegador. Uma nova nota substitui a nota anterior da mesma identidade anônima no mesmo livro. Não se armazena e-mail, nome nem endereço IP no banco de votos. O serviço Turnstile pode processar IP para verificação antiabuso.

O sistema não consegue provar que dois navegadores ou identidades anônimas pertencem à mesma pessoa. Portanto, um voto por pessoa **não é garantido**; são necessários monitoramento e limites adicionais se houver abuso. Para o desenvolvimento, são aceitas apenas solicitações da origem `https://ttamosauskas.github.io` e tokens Turnstile emitidos para `ttamosauskas.github.io`.

## Ordenação

Busca e filtros continuam funcionando como antes. Livros avaliados vêm primeiro em ordem decrescente de média; em empates, maior quantidade de votos; em empates completos e entre livros sem votos, ordem alfabética. A média e a contagem são exibidas ao lado de cinco estrelas. A interface permanece oculta enquanto o frontend estiver sem URL e site key.

## Testes

Na pasta `cloudflare/`, execute:

```bash
npm test
```

Para testar a D1 localmente após configurar o banco:

```bash
npx wrangler d1 migrations apply alexandria-ratings --local
npx wrangler dev
```

O teste local da API de votação também exige os segredos e a verificação Turnstile. Não utilize as chaves de produção em arquivos compartilhados.

Referências oficiais:
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
