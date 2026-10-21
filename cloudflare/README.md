# Avaliações anônimas — Cloudflare Workers + D1

O Alexandria permanece no GitHub Pages. O Worker abaixo é uma API separada, responsável exclusivamente por votos e médias.

**O D1 e a Site Key pública já estão configurados nesta branch. O site continua sem avaliações enquanto `apiBaseUrl` estiver vazio.**
Nenhuma credencial secreta deve ser adicionada ao GitHub.

## O que é necessário na sua conta Cloudflare

1. Acesse https://dash.cloudflare.com/ com sua conta; se aplicável, entre com Google. Essa autenticação exige ação do titular.
2. Em **Turnstile**, crie um widget para o hostname `ttamosauskas.github.io`. Guarde:
   - **Site key**, que é pública e vai para o frontend.
   - **Secret key**, que é privada e será armazenada como segredo do Worker.
3. **O banco D1 já foi criado. Não execute `d1 create` novamente.** A configuração em `wrangler.jsonc` já contém o identificador fornecido. A partir da pasta `cloudflare/` do repositório, autentique o Wrangler:

   ```bash
   npx wrangler login
   ```

   Certifique-se de estar na conta Cloudflare em que o banco `alexandria-ratings` foi criado.

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

7. Anote a URL **real** impressa por `npx wrangler deploy` (normalmente `https://alexandria-ratings.<subdominio>.workers.dev`). Confira no navegador se `<ENDERECO_DO_WORKER>/api/health` retorna `{"ok":true}` e `/api/ratings` retorna `{"ratings":[]}` antes de registrar votos. Se os resultados forem diferentes, pare e verifique o banco e os segredos.

8. **A Site Key pública já foi preenchida.** Depois de validar os endpoints do Worker, substitua somente `apiBaseUrl` em `assets/js/ratings-config.js`:

   ```js
   export const RATINGS_CONFIG = Object.freeze({
     apiBaseUrl: "https://SEU-WORKER.workers.dev",
     turnstileSiteKey: "0x4AAAAAAFeAofBJb0OQ9pGs",
   });
   ```

   Envie o endereço do Worker para configurarmos e verificarmos esta branch antes de publicar a alteração na `main`. **Não faça merge enquanto os testes da API não passarem.** Depois da validação e do merge, as estrelas e a ordenação serão ativadas no GitHub Pages. **Nunca copie** `TURNSTILE_SECRET` nem `VOTER_HASH_SECRET` para o frontend.

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

## Publicação sem terminal (GitHub Actions)

**É possível publicar usando apenas o navegador.** O workflow
[Publicar API de avaliações na Cloudflare](../.github/workflows/deploy-cloudflare-ratings.yml)
executa a migração D1, o deploy do Worker, registra o segredo do Turnstile
e cria automaticamente uma chave aleatória de 32 bytes para
`VOTER_HASH_SECRET`, apenas quando ela ainda não existir. Não altera a
`main` nem publica o frontend.

1. Entre na [Cloudflare](https://dash.cloudflare.com/) e obtenha o
   **Account ID** na visão geral da conta.
2. Crie um [API Token](https://dash.cloudflare.com/profile/api-tokens)
   limitado a essa conta com permissão para editar scripts Workers
   (incluindo a criação do Worker) e **D1 Edit** para aplicar a migração.
   Não compartilhe o token na conversa.
3. No repositório Alexandria, abra
   [Settings → Secrets and variables → Actions](https://github.com/TTamosauskas/alexandria/settings/secrets/actions).
   Adicione **três segredos de repositório**:
   - `CLOUDFLARE_ACCOUNT_ID` — identificador da conta Cloudflare.
   - `CLOUDFLARE_API_TOKEN` — token criado acima.
   - `TURNSTILE_SECRET` — **Secret Key** do widget Turnstile, não a Site Key pública.
4. Na aba [Actions](https://github.com/TTamosauskas/alexandria/actions),
   localize **Publicar API de avaliações na Cloudflare**, abra a execução
   da branch `feature/cloudflare-ratings` e use **Re-run jobs** depois
   de adicionar os segredos. Alternativamente, solicite que seja acionado
   novamente por uma atualização nesta branch.
5. Confira se o job terminou com sucesso. Nos detalhes do passo
   **Publicar Worker**, haverá um endereço público `https://...workers.dev`.
   O endereço é criado pela sua Cloudflare, e não é possível deduzi-lo
   a partir do nome do projeto ou do banco.
6. Verifique os endpoints `/api/health` e `/api/ratings`.
   Envie **somente o endereço público do Worker** para conectarmos o
   frontend na branch e testar um voto real.

**Atenção:** não execute o fluxo numa branch não confiável e não coloque
as chaves no código-fonte. O token de API pode ser revogado depois do
deploy se não desejar novas publicações. O fluxo está restrito à branch
de testes e não se executa no GitHub Pages.

## Situação verificada da API (21/10/2026)

O Worker foi publicado em `https://alexandria-ratings.thiago-gt.workers.dev` pela branch de testes.
A execução do [smoke test](https://github.com/TTamosauskas/alexandria/actions/runs/39651091120) validou:

- D1 vinculado (`GET /api/health` = 200).
- Lista de avaliações vazia (`GET /api/ratings` = 200).
- CORS aceitando apenas a origem da Biblioteca Oculta.
- Rejeição de notas inválidas e tokens Turnstile falsos.

A URL pública da API e a Site Key pública foram preenchidas em `assets/js/ratings-config.js` nesta branch.
O **envio real de voto com Turnstile válido** ainda precisa ser testado em um navegador na origem autorizada. Não faça merge automático na `main` enquanto este teste final não estiver concluído.
