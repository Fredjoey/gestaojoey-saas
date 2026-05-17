# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Sistema de **pedidos** Joey — cardápio do cliente, painel da loja e Cloud Functions. Projeto Firebase `pedidos-joey`. É o sistema original (single-tenant, a própria loja Joey), distinto do SaaS multi-tenant `gestaojoey`.

## Arquitetura

### Hosting — 3 sites (ver `firebase.json`)
- `pedidos-joey` — serve `cardapio.html` na raiz.
- `pedidos-joey-painel` — serve `painel.html` (o painel da loja; é o que o app Electron `joey-app` abre).
- `gestaojoey-painel` — multi-rota: `/pedidos*` → `painel.html`, `/gestao*` → `gestao-joey.html`, resto → `cardapio.html`.

`pedidos-joey` e `pedidos-joey-painel` fazem rewrite de `/api/emitirNFCe` e `/api/cancelarNFCe` para as Cloud Functions homônimas (região `us-central1`). `gestaojoey-painel` não tem esses rewrites.

### Cloud Functions — `functions/index.js` (Node 22)
- `emitirNFCe` / `cancelarNFCe` (HTTP) — emissão/cancelamento de NF-Ce via **Focus NFe**. Lê config fiscal de `clientes/joey/config/{fiscal,categoriasTributarias,ncmProdutos}` e grava resultado em `clientes/joey/notasFiscais`.
- `verificarCarrinhosAbandonados` (schedule, a cada 2 min) — carrinho abandonado N1: itera tenants em `clientes/` do projeto **gestaojoey**, acha carrinhos `pendente` com >7 min, envia mensagem via joeyapi (`/send`), marca `mensagem_enviada`; >24 h vira `expirado`.
- `backupFirestoreDaily` (schedule, 03:00 BRT) / `backupFirestoreManual` (HTTP, exige header `x-backup-token`) — backup recursivo dos dois Firestores para o Cloud Storage.

### Dois projetos Firebase numa função só
`functions/index.js` inicializa o app default (projeto `pedidos-joey`) **e** um segundo app `'gestao'` via `serviceAccount-gestaojoey.json`, apontando para o projeto `gestaojoey`. Várias funções leem/escrevem cross-project. O service account é gitignored, mas é obrigatório para deploy/execução das functions.

### Scripts de operação (raiz)
Dezenas de scripts `node` pontuais: `deletar_*`, `criar_*`, `atualizar_*`, `buscar_*`, `comparar_*`, `descobrir_*` — manutenção de Firestore, domínios Railway/Cloudflare, etc. `clientes_joey.json` (gitignored, LGPD). `config/emitente.json` — dados fiscais do emitente.

## Segredos

`backupFirestoreManual` usa a env var `BACKUP_TRIGGER_TOKEN`.

**Z-API removida (2026-05-16):** o bot de WhatsApp por Z-API foi descontinuado em favor do Baileys (`joeyapi`). As funções `webhookWhatsApp` e `mensagensProgramadas` e os secrets `ZAPI_*` foram removidos. ⚠️ Os tokens Z-API antigos ainda existem no histórico do git (commits anteriores) — a instância Z-API deve ser deletada no painel da Z-API para encerrar a exposição.

## Comandos

```bash
firebase deploy --only functions
firebase deploy --only hosting:pedidos-joey
firebase deploy --only hosting:pedidos-joey-painel
firebase deploy --only hosting:gestaojoey-painel
firebase functions:log
```

Não há build, testes nem lint.

## Aliases sugeridos

| Alias | Comando |
|---|---|
| `spj-deploy-fn` | `firebase deploy --only functions` |
| `spj-deploy-cardapio` | `firebase deploy --only hosting:pedidos-joey` |
| `spj-deploy-painel` | `firebase deploy --only hosting:pedidos-joey-painel` |
| `spj-logs` | `firebase functions:log` |
