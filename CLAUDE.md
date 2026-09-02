# CLAUDE.md — gestaojoey-saas

## ⚠️ Duas máquinas — sincronizar antes de tudo

O Fred trabalha em duas máquinas (desktop e notebook). ANTES de qualquer leitura ou mudança, rodar git fetch e conferir se o branch local está sincronizado com o origin. Se estiver atrás, avisar o Fred e não começar o trabalho até resolver.

## Extrato bancário (⑧ da aba Financeiro do gestao-joey.html) — **só o tenant joey**

Feature **em construção**, travada no slug `joey`: outro tenant não vê a seção, nem o upload, nem a conciliação. **Não altera o cálculo do lucro** — é conferência entre extrato e compras lançadas.

A seção segue o filtro de período que a aba Financeiro já tem (`_finPeriodRange`) — **não criar um segundo controle de data**. Renderiza no fim de `_finUpdate`, no mesmo padrão das outras: `<div class="section-title">` + `<div id="...Container">`.

Lembre que `gestao-joey.html` existe em **duas cópias** que precisam ficar idênticas (ver [gestao-joey dual deploy]) e que ele **não carrega o SDK de Storage** hoje — só `firebase-app`, `firestore` e `auth`.

O resto (regras de Storage, parser, Cloud Functions, `external_reference`) está documentado no `CLAUDE.md` do **gestaojoey-admin**.
