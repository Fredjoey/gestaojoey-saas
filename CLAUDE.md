# CLAUDE.md — gestaojoey-saas

## ⚠️ Duas máquinas — sincronizar antes de tudo

O Fred trabalha em duas máquinas (desktop e notebook). ANTES de qualquer leitura ou mudança, rodar git fetch e conferir se o branch local está sincronizado com o origin. Se estiver atrás, avisar o Fred e não começar o trabalho até resolver.

## Projetos Firebase e deploy das functions

São **dois** projetos, e o `--project` no deploy **não é opcional**:

| Projeto | Nº | O que vive lá |
|---|---|---|
| `gestaojoey` | 372331148907 | Firestore e Storage do SaaS multi-tenant (`clientes/{slug}/…`), Hosting dos painéis. É o **default** do `.firebaserc`. |
| `pedidos-joey` | 908000090595 | As **Cloud Functions deste repo** (`functions/index.js`, us-central1). |

As 8 functions deste repo (`emitirNFCe`, `cancelarNFCe`, `nfceXml`, `nfceDanfe`, `nfceXmlZip`,
`backupFirestoreDaily`, `backupFirestoreManual`, `verificarCarrinhosAbandonados`) estão no
**pedidos-joey**. As do painel admin (`provisionarCliente`, `gerarPixPedido`, `perguntarGestao`…,
southamerica-east1) são de **outro repo** (gestaojoey-admin) e vivem no gestaojoey.

Como o default do `.firebaserc` é `gestaojoey`, um deploy sem `--project` vai pro projeto errado:

```
firebase deploy --only functions:nfceDanfe --project pedidos-joey
```

`--dry-run` valida sem subir nada — serve de conferência antes do deploy de verdade.

### Credencial cross-project (por que o deploy já falhou de uma máquina só)

As functions rodam no pedidos-joey mas leem o Firestore do gestaojoey (`clientes/{slug}/…`) e o
bucket `gestaojoey.firebasestorage.app`. A ponte é o app secundário `gestao`, em `index.js`:

- com `functions/serviceAccount-gestaojoey.json` presente (gitignored — hoje só no desktop) → usa a chave;
- sem o arquivo → cai na credencial do ambiente (ADC) e **grita no log**.

O `require` é condicional, então o deploy **carrega e valida das duas máquinas**. Mas o fallback só
funciona em produção se o IAM do gestaojoey der acesso à conta de serviço de runtime das functions
do pedidos-joey — `908000090595-compute@developer.gserviceaccount.com` (confirmada na aba Segurança
da revisão no Cloud Run; é a conta padrão, compartilhada por todas as functions do projeto):

| Papel | Onde |
|---|---|
| `roles/datastore.user` | projeto `gestaojoey` |
| `roles/storage.objectAdmin` | bucket `gestaojoey.firebasestorage.app` |

Todas as 8 functions dependem desse acesso — inclusive o `verifyIdToken` que autentica as rotas
fiscais. Sem a chave **e** sem os papéis, elas sobem e quebram em runtime, não no deploy.

**Estado em 03/10/2026: papéis NÃO concedidos** (o IAM do gestaojoey só tem contas do próprio
projeto). Enquanto for assim: **deploy só do desktop**, que é onde a chave está. Quando a concessão
sair, atualizar esta linha — o resto da seção continua valendo.

## Extrato bancário (⑧ da aba Financeiro do gestao-joey.html) — **só o tenant joey**

Feature **em construção**, travada no slug `joey`: outro tenant não vê a seção, nem o upload, nem a conciliação. **Não altera o cálculo do lucro** — é conferência entre extrato e compras lançadas.

A seção segue o filtro de período que a aba Financeiro já tem (`_finPeriodRange`) — **não criar um segundo controle de data**. Renderiza no fim de `_finUpdate`, no mesmo padrão das outras: `<div class="section-title">` + `<div id="...Container">`.

Lembre que `gestao-joey.html` existe em **duas cópias** que precisam ficar idênticas (ver [gestao-joey dual deploy]) e que ele **não carrega o SDK de Storage** hoje — só `firebase-app`, `firestore` e `auth`.

O resto (regras de Storage, parser, Cloud Functions, `external_reference`) está documentado no `CLAUDE.md` do **gestaojoey-admin**.
