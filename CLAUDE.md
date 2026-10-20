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

**Estado em 03/10/2026: papéis concedidos — deploy sai das duas máquinas.** Confirmado em
produção no mesmo dia: a `nfceDanfe` foi deployada de uma máquina sem a chave no diretório (revisão
`nfcedanfe-00002-qet`); o log do boot trouxe o aviso do fallback e a function leu
`clientes/joey/notasFiscais` no gestaojoey normalmente — o aviso diz que o caminho mudou, não que
falhou.

Uma ressalva enquanto durar: **as outras 7 functions ainda rodam a revisão de julho**, com a chave
embutida naquele bundle. Cada uma passa a usar ADC no primeiro redeploy — é aí que o
`storage.objectAdmin` entra em jogo, na `nfceXml`/`nfceXmlZip`, que gravam e leem os XMLs.

## Pedidos do iFood: o painel RESPONDE ao iFood (em produção desde 14/10/2026)

Publicado nos 3 sites do painel em 14/10/2026 ~11:30 (commit `0a336c9`, merge da `ifood-fase2`), depois dos
testes na prévia (confirmar/pronto/despachar, cancelar, auto-aceitar) e de uma regressão de pedido manual
(+ Novo Pedido → entregue sem chamar o iFood). Hoje só a loja de teste do `clienteteste` está ligada.

Pedido com `origem:'ifood'` + `ifoodOrderId` é gravado pelo serviço **joey-ifood** (repo `Fredjoey/joey-ifood`,
Railway, `IFOOD_API` = `https://joey-ifood-production.up.railway.app`). O desenho completo do serviço está no
CLAUDE.md de lá. No painel (`_ehIfood(p)`):

- **Confirmar → Produção / Marcar pronto / Enviar para entrega** (`avancarStatus` → `_avancarIfood`): chama o
  serviço (`/confirmar`, `/pronto`, `/despachar`) com o ID token do login. **Só com o iFood aceitando** o card
  anda (`_aplicarAvanco`, o avanço de sempre); recusa → toast com o erro do iFood e o card FICA. Trava de duplo
  clique em `_ifoodEmAndamento` (selo "⏳ Enviando ao iFood…"). Entrega do iFood / retirada: o serviço não chama
  `dispatch` (a doc proíbe) e devolve `semChamada` — o card anda igual.
- **Cancelar** (`cancelarPedido` → `cancelarIfoodAbrir`): modal próprio `#cancelIfoodModal` com os motivos que o
  iFood devolve (nunca lista fixa). É assíncrono: o card **não** vira cancelado no clique — ganha o selo
  "⏳ Cancelamento pedido ao iFood" e muda quando o CAN chega; CARF → selo vermelho com o motivo.
- **Sem WhatsApp ao cliente** em pedido do iFood (`cliente.tel` é `''`; o telefone do iFood é 0800).
- **Auto-aceitar**: o do painel PULA pedido do iFood — quem auto-aceita é o serviço (confirma no iFood e põe em
  produção com `autoAceito`); o painel só imprime a comanda uma vez ao ver o card chegar assim.
- **Sem eco**: os eventos do iFood mudam o status direto no Firestore; nada disparado por snapshot chama o iFood.
- **Código de entrega (Fase 2b, em produção desde 14/10/2026 ~12:05, commit `68224a4`)** — só pedido iFood
  DELIVERY + `ifoodEntregaPor:'MERCHANT'`:
  - **Painel** (`_ifoodCodigoHtml`/`validarCodigoIfood`): campo "Código de entrega" + "🔑 Validar e entregar" no
    card em **Prontos** (o serviço despacha antes) e em **Saiu para entrega**. O digitado e o foco sobrevivem ao
    re-render (`_ifoodCod`, `_ifoodCodigoRefocar` no fim do `renderKanban`). Erro → toast + linha vermelha no card.
  - **App do motoboy** (`entregador.html`): no pedido iFood de entrega própria o "✅ Entreguei" vira campo +
    "✅ Validar e entregar", com o erro escrito no card (sem `alert`). Chama a mesma rota com o ID token do
    entregador (o joey-ifood aceita o token do `entregadorAuth` só nessa rota, só no pedido atribuído a ele).
    Pedido `pagamento:'ifood'` aparece "📱 Pago no iFood" (antes caía em "Dinheiro · receber"); `credito`/`debito`
    contam como cartão.
  - Quem grava `finalizado` + `entregueEm` é o **serviço** (só se o iFood aceitar) — painel e app só refletem o
    snapshot. O CON chega depois e não muda nada. O "Finalizar pedido" segue só arquivando.
- **Homologação (em produção desde 14/10/2026 ~12:40, commits `6482ad3`…`99be6fa`; ✅ APROVADA 100% em 14/10/2026,
  app "Gestão Joey" — próximos passos no CLAUDE.md do joey-ifood)** — só pedido iFood:
  - **Comanda do iFood** (`gerarHtmlComandaIfood`, no modelo da doc "Detalhes do pedido → Impressão"): os DOIS cupons
    (`gerarHtmlComanda` e `gerarHtmlPedidoProducao`) desviam para ela. Nº iFood, tipo/AGENDADO, 0800 + ID
    (localizador), pedidos na loja, itens com complementos e obs, "Desconto (IFOOD/LOJA)", formas de pagamento
    (online × cobrar na entrega, bandeira, TROCO PARA / LEVAR TROCO), obs do pedido, código de coleta, "Incluir
    CPF/CNPJ na nota fiscal", bloco ENTREGA. Entrega **pelo iFood**: sem endereço e sem CPF (doc: não imprimir
    para parceiro de entrega). Cancelado sai com "PEDIDO CANCELADO · Motivo".
  - **Card e modal** (`_ifoodBadgesHtml`, `_ifoodModalHtml`): agendado, "Pago online · bandeira" / "Cobrar … troco
    p/ … (levar …)", cupom por pagador, CPF/CNPJ (só se for CPF/CNPJ — documento estrangeiro aparece à parte, fora
    da nota), código de coleta, obs do pedido e dos itens, motivo de cancelamento com quem cancelou. Modal sem
    "Trocar forma", "Editar" e "Pedir novamente". NFC-e já abre com o CPF/CNPJ do pedido iFood.
  - **Cancelado pelo iFood não some**: fica no topo de "Em análise" com o motivo até "✓ Ciente"
    (`ifoodCancelamentoVisto`). Na transição para cancelado: toast + som + push; se já estava em preparo e não foi a
    loja que pediu, sai o cupom de cancelado. O "Ciente" NÃO recarrega a página (só grava o campo e redesenha);
    em modo suporte o tenant fica preso à aba (ver CLAUDE.md do gestaojoey-admin, "MODO SUPORTE").
  - **Plataforma de Negociação** (HSD): faixa no topo do Kanban (`#ifoodNegFaixa`, vale p/ pedido já finalizado) +
    modal `#ifoodNegModal` para aceitar (motivos que o iFood mandou) ou recusar (lista da doc). Rotas
    `negociacao-aceitar`/`negociacao-recusar` do joey-ifood. Contraproposta: só pelo Portal do Parceiro.
- Domínio novo servindo o painel → entra também no CORS do joey-ifood (`src/cors.js`), além da chave do Maps.

### "Conectar meu iFood" + motoboy para todos — 🟢 PUBLICADO em 15/10/2026 09:26 (`7f42d4f`, 3 sites)

- **Configurações → "iFood — conectar minha loja"** (`#secaoIfoodConexao`, todos os tenants): o restaurante informa o ID
  da loja no iFood (ou o CNPJ) → o painel grava `config/ifoodConexaoPedido` `{ id, acao: conectar|desconectar|cancelar,
  merchantId, cnpj, por, em }` (`_ifxPedido`); o joey-ifood (`src/conexao.js`) devolve o estado em `config/ifoodConexao`
  (`_ifoodConexaoOuvir`/`_ifxRender`): ⏳ pedido recebido (a equipe pede o acesso) → ⏳ falta você aprovar no Portal do
  Parceiro (passo a passo; "conferimos a cada 15 min") → 🟢 conectado (Desconectar com confirmação dentro do card; loja
  `protegido` — a Joey — não desconecta pelo painel) / ⚠️ erro (loja de outro restaurante, autorização removida…). Fluxo e
  segurança: CLAUDE.md do joey-ifood; fila da equipe: aba iFood do admin. Sem o serviço com `IFOOD_CONEXAO=on` o card só
  mostra "Pedido registrado — aguardando o serviço".
- **Motoboy para todos os tenants** (antes só `joey`): cadastro em Configurações, faixa de plantão, "Atribuir entregador"/
  "trocar", aviso ao motoboy. O aviso usa o template `joey_entrega_motoboy` SÓ na Joey (o template é da conta de WhatsApp
  dela); nos outros vai o texto pelo bot do próprio restaurante. `entregador.html`: fora da Joey o cabeçalho leva o nome
  da loja (`config/loja.nome`) em vez de "Joey Entregas". A rota `/entregador/**` já existia em todos os domínios.
  ⚠️ Abrir o link do motoboy no MESMO domínio (e navegador) em que o painel está logado troca a sessão (o app do motoboy
  faz `signInWithCustomToken`; a sessão do Firebase é por domínio) → o painel desse domínio mostra "Não encontramos um
  restaurante vinculado a esta conta" até entrar de novo. Comportamento antigo (já era assim na Joey).
- Testado em 15/10/2026 na prévia `ifood-fase2` com o `clienteteste` (motoboy cadastrado → atribuído → app do motoboy →
  "Entreguei"; conexão da loja de teste com o joey-ifood LOCAL) — dados de teste apagados. Prints em
  `Desktop/_resumos-claude/2026-10-15_*_ifood-saas*`.
- **Publicado em 15/10/2026 09:26** (merge `ifood-saas` → `master`, fast-forward; `pedidos-joey-painel` + `pedidos-joey`
  no projeto pedidos-joey e `gestaojoey-painel` no gestaojoey), conferido nos 7 domínios (mesmo `painel.html`/`entregador.html`)
  e em produção: Joey com "🟢 Conectado ao iFood … Conexão gerenciada pelo suporte" (sem Desconectar); card no `clienteteste`;
  motoboy no `clienteteste` (atribuir no card em "Prontos" → app "clienteteste · Entregas" → "Entreguei"); pedido manual
  sem chamar o iFood. Antes estava no ar o `1c5e19c` (painel) / `68224a4` (motoboy) — **rollback**: worktree em `1c5e19c` +
  os mesmos `firebase deploy --only hosting:…`, ou Console → Hosting → histórico de versões → Reverter (em cada um dos 3 sites).

### Loja no iFood (módulo Merchant) — código PUBLICADO em 15/10/2026 junto com o pacote SaaS, mas INVISÍVEL (o serviço está com `IFOOD_MERCHANT` desligado)

Status da loja no iFood + pausa + horários, para ter um lugar só (detalhes do serviço: CLAUDE.md do joey-ifood,
"Módulo Merchant"). **Não usa HTTP**: o painel lê `clientes/{slug}/config/ifoodLoja` (o serviço grava) e grava o
comando em `config/ifoodComando` (`_iflComando`); o serviço executa e devolve o resultado no mesmo doc.
- **Só aparece com `config/ifoodLoja.ligado === true`** — tenant sem loja iFood (ou com o módulo desligado no
  serviço) não muda nada. Item "Loja no iFood" na faixa do topo (`#ifoodLojaItem`: 🟢 Online / ⏸️ Pausado até HH:MM
  ou até reabrir / 🌙 Fechado (horário) / 🔴 Offline; "⚠️ sem notícia do serviço" com mais de 5 min sem atualizar) +
  botão (⏸ Pausar abre o modal; ▶️ Retomar se a pausa ativa é nossa). Modal `#ifoodLojaModal`: o que o iFood diz
  (título + validações), pausas (nossa × "feita no iFood (Gestor de Pedidos/Portal)"), Pausar 15/30/60 min/até
  reabrir, Retomar, "Retomar mesmo assim" (tira a pausa externa — confirmação DENTRO do modal, sem `confirm()`), e
  horários do iFood com "Enviar os horários do Gestão Joey…" → prévia dia a dia (diferenças em laranja) →
  "Sobrescrever horários do iFood" (o PUT substitui tudo). `_iflTurnosDoPainel` = a mesma conversão do serviço.
- **Aberto/Fechado das Configurações** (`cfgAberto` → `salvarConfig`): quem leva ao iFood é o SERVIÇO (fechar = pausa
  até reabrir; abrir = tira a pausa). Com loja ligada aparece a nota `#cfgIfoodNota` embaixo do toggle; o painel
  avisa o resultado por toast (`ifoodLoja.toggle`). Com a loja Fechada no painel os botões de pausa ficam travados.
- Testado na prévia `ifood-fase2` com o joey-ifood LOCAL (loja de teste, `clienteteste`) em 14/10/2026: vídeos e prints
  em `Desktop/_resumos-claude/2026-10-14_ifood-merchant-homologacao/`. Na prévia o mapa de "Posição no mapa"
  mostra "Opa! Algo deu errado" (domínio da prévia fora da chave do Maps) — esperado.
- **Publicar** só depois de o módulo Merchant estar homologado e ligado no joey-ifood; antes disso publicar não
  quebra nada (sem `ifoodLoja` o painel não mostra), mas não há o que mostrar.

### Cardápio no iFood (módulo Catalog) — código PUBLICADO em 15/10/2026 junto com o pacote SaaS, mas INVISÍVEL (o serviço está com `IFOOD_CATALOGO` desligado); o preço editável do Gestor de cardápio JÁ VALE para todos

O cardápio do Gestão replicado no iFood com **+20%, para cima no ,90** (configurável), sincronizado sozinho depois do 1º
envio (detalhes do serviço: CLAUDE.md do joey-ifood, "Módulo Catalog"). Mesmo modelo do Merchant: o painel lê
`config/ifoodCatalogo` (o serviço grava) e pede por `config/ifoodCatalogoComando` (`_ifcComando`). Regra em
`config/ifoodPreco` `{ percentual, arredondamento: '90'|'99'|'nenhum' }` — o painel grava direto.
- **Só aparece com `config/ifoodCatalogo.ligado === true`**: item "Cardápio no iFood" na faixa do topo (`#ifoodCardItem`:
  ⏳ ainda não enviado / ✅ sincronizado HH:MM / ⚠️ falha ao sincronizar / ⚠️ item sumiu do iFood / ⚠️ diferente no iFood /
  🔒 confirme a mudança), seção **Configurações → iFood — cardápio** (`#secaoIfoodCardapio`: acréscimo %, arredondamento,
  exemplo ao vivo; com o cardápio já ligado, salvar pede confirmação "muda o preço de N itens e M adicionais no iFood") e
  modal `#ifoodCardModal`: status, **prévia** (tabela item × preço Gestão × preço iFood × ação Criar / Ligar ao existente /
  Atualizar / Igual / Criar de novo / Conflito / Erro; adicionais; "Só no iFood — não mexemos"; "Fora do cardápio") →
  "Confirmar e enviar ao iFood" com progresso; **"No iFood agora"** (releitura do iFood com ✓/⚠️ e a hora); "Não enviados";
  "Apagados no Gestão" com "Apagar do iFood…" (confirmação dentro do modal); trava "Aplicar mesmo assim…"; log.
- `_ifcPreco` = a MESMA conta do serviço (`catalogoRegras.precoIfood`); `_ifcVaiProIfood` = a mesma régua (ativo, não
  só-mesa, nome ≤ 100, preço > 0).
- ⚠️ **Gestor de cardápio: preço EDITÁVEL** (clique no preço → campo → Enter/✓) para item (`recipes/{id}.price`) e
  adicional (`adicionais/{id}.preco`), com a linha no `auditLog` igual à do Sistema Joey (detalhe "… (pelo painel)").
  **Vale para todos os tenants** quando publicar (não depende do iFood). Com o cardápio ligado ao iFood aparece embaixo
  "iFood R$ X" (✓ quando a última releitura do iFood mostra exatamente esse preço).
- Testado na prévia `ifood-fase2` com o joey-ifood LOCAL (loja de teste, `clienteteste`) em 14/10/2026; prints e logs em
  `Desktop/_resumos-claude/2026-10-14_ifood-catalogo-homologacao/`. Publicar só depois de o Catalog estar homologado e
  ligado no joey-ifood (sem `ifoodCatalogo` nada aparece, exceto a edição de preço).

## Pedidos, loja e cardápio da 99Food — branch `feat/99food` (20/10/2026) — ⚠️ NÃO PUBLICADO

Mesmo modelo do iFood: quem fala com a 99 é o joey-ifood (módulo `src/99food/`, tudo DESLIGADO por flag — CLAUDE.md do
joey-ifood, seção "99Food"); o painel chama as rotas `${IFOOD_API}/99food/pedidos/:slug/:id/…` e lê/grava docs em
`config/`. **Sem o módulo ligado nada da 99 aparece** (pedido `origem:'99food'` só existe se o serviço criar; as telas de
loja/cardápio/conexão só aparecem com `config/food99Loja.ligado`, `config/food99Catalogo.ligado`, `config/food99Conexao.disponivel`).
Publicar ANTES de ligar as flags (o app do motoboy antigo mostraria "Dinheiro · receber" em pedido da 99 já pago).
- **Pedido** (`_eh99`, `_ehPlataforma` = iFood ou 99): card com selo 99 #`food99OrderIndex`, prazo de confirmação (5 min,
  `food99ConfirmarAte`), pagamento (pago na 99 / dinheiro ou Pix na entrega a receber / "entregador da 99 paga em dinheiro"),
  código do entregador/retirada; avançar → `_avancar99` (confirmar/pronto/despachar/entregue no serviço; o card só anda com
  o ok da 99); botão do pronto conforme o tipo (`_99RotuloPronto`: cliente retirou / entregador da 99 retirou / enviar);
  entrega PRÓPRIA com código de entrega (`_99CodigoHtml`, mesmo estado `_ifoodCod`); cancelar pelo modal `#cancel99Modal`
  (motivos da 99); cancelado pela 99 fica no topo até "Ciente" (`food99CancelamentoVisto`); pedido de cancelamento/reembolso
  do cliente → faixa `#food99SolFaixa` + modal `#food99SolModal` (aceitar/recusar com motivo da lista); comanda própria
  `gerarHtmlComanda99` (pedido com entregador da 99 sai sem CPF e sem endereço). Sem WhatsApp, troca de pagamento, editar ou
  "pedir novamente" em pedido de plataforma. Finalizar/arquivar pedido de entrega própria ainda em "entregue" avisa a 99
  antes (`_99EntregueEArquivar`). Auto-aceitar: o do painel PULA a 99 (quem confirma é o serviço, com o mesmo toggle).
- **Loja na 99** (`#food99LojaItem` + `#food99LojaModal`, `config/food99Comando`): abrir, fechar, pausar 10/20/30 min ou até
  o fim do dia (com motivo), modo ocupado, enviar horários do Gestão — a 99 aceita 1 mudança por minuto (o modal mostra "vai
  à 99 em X s"; comando novo substitui o da fila).
- **Cardápio na 99** (`#food99CardItem` + `#food99CardModal` + Configurações → `#secao99Cardapio`): regra própria em
  `config/precos99` `{ percentual, arredondamento }`, **padrão 0%**, **trava +10%** (contrato da 99; `_f99RegraErro` recusa
  e explica; as regras do Firestore também); `_f99Preco` = a mesma conta do serviço (conferida em 60.018 combinações).
  Prévia → "Enviar à 99" (⚠️ o envio SUBSTITUI o cardápio inteiro da loja na 99) → sincronização sozinha; avisos de foto,
  itens fora, trava de massa. O iFood segue com a regra dele (`config/ifoodPreco`).
- **Conectar meu 99Food** (`#secao99Conexao`, `config/food99ConexaoPedido`): o restaurante informa o ID da loja (só números)
  e autoriza no link da 99; a equipe confere (admin grava `food99Conexao.equipe`) e o serviço liga.
- **Motoboy** (`entregador.html`): selo 99Food, "📱 Pago na 99" / "📱 Pix na entrega · receber", código de entrega da 99
  (rota `/99food/…/codigo-entrega`).
- Conferido num sandbox (Node `vm`, DOM/Firebase simulados): pedidos normais e do iFood renderizam IGUAL ao `master` (card,
  comanda, produção, modal — 79 comparações; motoboy 3 cards); só os da 99 mudam. Não testado em navegador nem com a 99 real.

## Bairro liga/desliga (desde 15/10/2026)

Configurações > Bairros ganhou um toggle por bairro. Pausar tira o bairro do cardápio e do
robô **sem apagar a taxa** — não precisa recadastrar quando voltar a entregar lá.

- `painel.html` → `toggleBairroAtivo(i)` grava `bairros[i].ativo` e salva na hora.
- **Convenção: `ativo !== false` = entregando.** Bairro antigo não tem o campo e continua
  valendo — não existe migração.
- `cardapio.html` → `_bairroOn()`; o `<option>` do bairro pausado vira "sem entrega no
  momento" e fica `disabled`. Quem já tinha endereço salvo naquele bairro vê um aviso
  (`_bairroSalvoPausado`) em vez de descobrir só no fim.
- ⚠️ **Trava no envio**: mesmo que o `<option>` seja burlado, o pedido não passa. O `<select>`
  é editável pelo DevTools — não tire essa checagem achando que o `disabled` basta.
- Lado do bot: `joeyapi/src/claudeIA.js` (ver o CLAUDE.md de lá).

## Sugestão da noite (desde 15/10/2026)

Pedido da Isabela: o robô abria toda conversa com "vai de x-salada de novo?" e ficou
repetitivo. Agora a loja escreve o que quer oferecer naquela noite.

- Campo em **Robô > 🧠 Atendente Inteligente**, logo abaixo de "Aviso do momento".
- Grava em `clientes/<slug>/config/iaInstrucoes.sugestaoNoite = { texto, data }`.
- `data` é o DIA em que o texto foi escrito (`_hojeISOSP()`, fuso −3). O bot só usa se for
  hoje — **é isso que impede a promoção de quinta de continuar sendo oferecida na sexta.**
- ⚠️ `_sugPayload()` só re-carimba a data **se o TEXTO mudar**. Salvar o atendente por outro
  motivo (tom de voz, regras) NÃO renova a sugestão. Se mexer aqui, preserve esse detalhe:
  sem ele, qualquer save vira "sugestão de hoje" e a validade por dia deixa de existir.
- `_iaSugStatus()` mostra "escrita hoje" / "ainda não salva" / "expirou";
  `limparSugestaoNoite()` esvazia o campo (ainda precisa salvar).
- Lado do bot: `joeyapi/src/atendimentoV2.js` (ver o CLAUDE.md de lá).

## Extrato bancário (⑧ da aba Financeiro do gestao-joey.html) — **só o tenant joey**

Feature **em construção**, travada no slug `joey`: outro tenant não vê a seção, nem o upload, nem a conciliação. **Não altera o cálculo do lucro** — é conferência entre extrato e compras lançadas.

A seção segue o filtro de período que a aba Financeiro já tem (`_finPeriodRange`) — **não criar um segundo controle de data**. Renderiza no fim de `_finUpdate`, no mesmo padrão das outras: `<div class="section-title">` + `<div id="...Container">`.

Lembre que `gestao-joey.html` existe em **duas cópias** que precisam ficar idênticas (ver [gestao-joey dual deploy]) e que ele **não carrega o SDK de Storage** hoje — só `firebase-app`, `firestore` e `auth`.

O resto (regras de Storage, parser, Cloud Functions, `external_reference`) está documentado no `CLAUDE.md` do **gestaojoey-admin**.

## Jogo da cobrinha — REMOVIDO em 08/10/2026

O "🐍 Joga enquanto espera" (tela de pedido confirmado do cardápio, só joey, desde 25/06) saiu: JS, CSS, overlay
`#gameOverlay`, botão e o campo "Frase do prêmio do jogo" do painel (~308 linhas do `cardapio.html`, ~9% do arquivo).

- **Motivo (medido em 08/10):** ~3% de adesão — 6/9/7 jogadores com recorde em jul/ago/set contra ~250 clientes/mês do
  cardápio; 21 jogadores distintos em 3 meses; 1 único voltou em outro mês. Nenhum prêmio registrado no sistema.
- **Dados preservados:** `clientes/joey/ranking_cobrinha` (34 docs, jun–out) NÃO foi apagada. `config/loja.premioJogo`
  também fica — sem tela, mas na lista de preservação do `salvarConfig` (o set total apagaria).
- **Regra do Firestore mantida** (`gestaojoey-admin/firestore.rules`, com comentário): removê-la é mudança de segurança,
  a fazer separado. Sem o jogo, nada mais grava lá.
- Os botões da tela de confirmado já eram de largura total, empilhados — sem o do jogo não sobrou vão.

## Mapas do painel — Google Maps JS (desde 03/10/2026)

Os 3 mapas do `painel.html` (mapa de pedidos, posição da loja em Configurações, portaria do bairro) usam
**Google Maps JavaScript API**. Antes era Leaflet + fundo do CARTO, que passou a exigir chave e mostrava
"API KEY REQUIRED" em cada tile. Só a equipe vê mapa — cardápio e página do entregador não têm (o entregador
abre a rota por link do Google Maps/Waze, sem custo de API).

- **Chave de NAVEGADOR** (`GMAPS_KEY`, no próprio `painel.html`): projeto `joey-secretario`, restrita à Maps
  JavaScript API e aos **9 referenciadores** que servem o painel:
  ```
  https://*.gestaojoey.com.br/*                  (inclui app.gestaojoey.com.br, que o joey-app abre)
  https://hamburgueriajoey.com.br/*
  https://pedidos.hamburgueriajoey.com.br/*      (faltou na 1ª lista — o mapa não abria nele; adicionado em 03/10)
  https://pedidos-joey.web.app/*
  https://pedidos-joey.firebaseapp.com/*
  https://pedidos-joey-painel.web.app/*
  https://pedidos-joey-painel.firebaseapp.com/*
  https://gestaojoey-painel.web.app/*
  https://gestaojoey-painel.firebaseapp.com/*
  ```
  ⚠️ Domínio novo servindo o painel → incluir no console da chave, senão o mapa não abre ali (sem erro no resto
  da tela). Foi o que aconteceu com o `pedidos.hamburgueriajoey.com.br`: a lista inicial saiu de uma varredura
  dos domínios conhecidos e ele não estava nela.
  **Não é a chave do Geocoding** (essa é de servidor, segredo do `gestaojoey`).
- **Map ID** `GMAPS_MAP_ID` (Rasterização): estilo escuro no slot "Modo escuro" → o mapa é criado com
  `colorScheme: DARK`; sem isso abre claro.
- Marcadores: `AdvancedMarkerElement`. ⚠️ Clique só com `gmpClickable: true` + evento `gmp-click` —
  `addListener('click')` não torna o marcador clicável (3.66). Arrasto: `gmpDraggable` + `dragend`.
- Custo: 1 map load por `new Map`; cada mapa é criado **uma vez por sessão** e reaproveitado (o snapshot dos
  pedidos redesenha os marcadores, não o mapa). Uso estimado bem abaixo dos 10 mil grátis/mês.

## Motoboy de plantão no dia (desde 04/10/2026)

`ativo` (cadastro) = trabalha aqui; inativo some de tudo. **Plantão** = quem está trabalhando HOJE: campo
`motoboys/{id}.plantaoEm` (ms), que vale só no **dia de trabalho** corrente — das **05:00 às 05:00** de SP
(`_inicioDiaTrabalho`). Ninguém zera nada: a marcação de ontem fica antes das 05:00 de hoje e deixa de contar.
Corte às 05:00 para uma entrega depois da meia-noite não tirar o motoboy do plantão no meio do turno.

- Faixa `#plantaoBar` no topo do kanban (todos os tenants desde 15/10/2026 — publicado; antes só joey): um chip por motoboy ativo, toque liga/desliga
  (`togglePlantao`). Sem ninguém marcado, ela fica laranja e pergunta "Quem está de plantão hoje?".
- "Atribuir entregador" e "trocar" (`_mbOpts`) mostram **só quem está de plantão**. Ninguém marcado →
  mostram todos os ativos com o aviso "escolher já marca", e `atribuirMotoboy` grava o `plantaoEm` de quem
  foi escolhido (decisão do Fred: não travar o atendimento por esquecimento).
- Painel aberto de um dia para o outro: um relógio de 60 s refaz a faixa e as listas na virada das 05:00.

## ⚠️ Mesas: o PEDIDO é a fonte única (desde 04/10/2026)

O item de mesa existe **só na coleção `pedidos`**. O doc `mesas/{id}` guarda só **estado**: `status` e `conta`
(`pagamentos`, `itensPagos`, `divisao`). Os campos `comandas`, `pedidos` (lista) e `total` não são mais
gravados nem lidos (a migração de 04/10 tirou dos 15 docs).

- **Por quê**: o lançamento do salão (`confirmarPedidoMesa`) gravava os itens como comanda no doc da mesa E
  como pedido; o QR do cardápio (`atualizarMesaComPedido`) copiava para a lista `pedidos` do doc. A conta
  (`_comandasDaMesa`) somava as duas cópias — premissa errada no comentário "as fontes são disjuntas". Mesa 7
  em 04/10: Heineken 2×. Auditoria de 125 dias: 3 contas com pedido inteiro cobrado duas vezes (R$ 112;
  teto R$ 601) e ~R$ 3.600 cobrados em comanda que nunca virou pedido (fora do faturamento/DRE).
- **Quem grava**: salão → só o pedido (+ `status:'ocupada'` na mesa); cardápio QR → só `status:'ocupada'`;
  garçom → só o pedido. Cancelar pedido e "Fechar conta" zeram a mesa para `{status:'livre'[, conta]}`.
- **Quem lê**: card do salão, "🧾 Conta", conferência (painel), app do garçom (`garcom.html`) e a Joey IA
  (`statusMesas`/`consumoMesa`, gestaojoey-admin) — todos pelos pedidos ativos da mesa, com a regra
  `_pedidosDaMesa` (id do cadastro, número, ou `mesa-<n>`). Item pago continua `ped-<id>#<idx>`.
- **Trava de duplo clique** em `confirmarPedidoMesa` (`_pedidoMesaEnviando` + botão desabilitado), o mesmo
  padrão do `contaFechar` (`_mesasFechando`). Falha ao lançar não grava nada; o carrinho fica para tentar de novo.
- Removido o código morto que ainda gravava comanda (sem nenhum chamador): editar/cancelar/imprimir comanda,
  remover pedido da mesa, o modal antigo de fechar conta e o "dividir conta" antigo.
- **Mesa 1 — corrigido em 07/10/2026.** Recadastrada em 19/05 com id aleatório `cTllcOFyh3ZLCcxZ18Q4` (o "Nova mesa"
  usava `.add()`); o QR impresso, de quando era `mesa-1`, grava `mesa:"1"` → o salão nunca casava e 53 pedidos do QR
  (R$ 2.284, 26/06 a 03/10) ficaram em "entregue". Correção por script, nesta ordem: os 53 → `finalizado` +
  `arquivado` com `finalizadoPor:'correcao-mesa1'` (sem fechamento: pagos no salão, forma não registrada; já estavam
  no faturamento) → cadastro virou `mesas-config/mesa-1` (`recadastradaDe`) → as 17 vendas e 1 fechamento com o id
  antigo foram para `mesa:'mesa-1'` (`mesaAntes`). `mesas/cTllcOFyh3ZLCcxZ18Q4` (livre, conta vazia) ficou órfão.
  ⚠️ A ordem importa: casar a mesa antes de finalizar faria os 53 aparecerem como conta aberta.
- **"Nova mesa" grava `mesa-<n>`** (`_mesaNovoId`), nunca id aleatório: "Mesa 8" → `mesa-8`; outro nome (ou número
  tomado) → o próximo `n` livre no cadastro E sem pedido no histórico (não herdar vendas de mesa apagada).

## ⚠️ Inbox: TODO texto de fora passa por `_esc()` (desde 04/10/2026)

Mensagem (cliente, IA, atendente), nome do contato (o `pushName` que o CLIENTE escolhe) e "última mensagem"
entravam crus no `innerHTML` do inbox: um cliente podia mandar `<img src=x onerror=…>` e o código rodava no
navegador de quem atende, logado como admin. Medido num harness com as funções reais: **6 execuções antes, 0
depois**. Regra: no inbox, nada vindo do Firestore entra em HTML sem `_esc()`; id em `onclick` passa por
`_wppIdJs` (só `[\w@.-]`). Nenhuma das 11.636 mensagens gravadas tinha HTML — o escape não muda nada visível.
⚠️ **Fora do inbox ainda há texto do cliente cru** (ex.: `obs` dos itens e `ref` do endereço na comanda/impressão,
que é aberta com `window.open('')` na MESMA origem do painel) — varredura dedicada pendente.

## Faixa de espera — botão "✓ já resolvi" (desde 10/10/2026)
Cada linha da faixa vermelha tem um **✓** que tira aquela espera da tela. Grava
`esperaResolvidaEm` na conversa; `_esperaDaConversa` ignora espera que começou ANTES dessa marca.
Vale para os dois tipos (transferência e aviso da IA).

Por que foi preciso: a regra automática só fecha a espera quando uma PESSOA escreve ao cliente. Mas
há caso em que o assunto morre sem ninguém precisar escrever — Juliana, 10/10: a IA transferiu às
22:13 ("já chamei alguém da equipe") e o pedido #36144 saiu confirmado às 22:14. A Isabela viu que
estava resolvido e não tinha como dizer isso; a faixa ficou. Pedido dela.

- Não escreve ao cliente, não devolve a conversa ao bot, não apaga o alerta — só registra o instante.
  O histórico fica no Firestore para auditoria.
- Espera NOVA (transferência ou aviso depois da marca) volta a aparecer normalmente.
- Some da tela na hora; se a gravação falhar, a faixa VOLTA e avisa — nunca some em silêncio.
- ⚠️ Mensagem automática NÃO resolve sozinha: o cliente ouviu "já chamei alguém" e pode estar
  esperando uma pessoa de verdade. Quem decide que acabou é a equipe, clicando.

## Áudio do cliente no inbox — selo "🎤 áudio" (desde 10/10/2026)
Nota de voz do cliente chega TRANSCRITA (joeyapi/`src/transcrever.js`, Whisper). A mensagem grava
`audio: true`, e o balão mostra o selo `🎤 áudio` (`.wpp-audio-tag`) acima do texto.

Por que o selo importa: o texto no balão NÃO é o que o cliente digitou — é o que a máquina ouviu.
Transcrição erra número ("dois" → "doze") e nome parecido, e a IA já respondeu com base nela. Quem
atende precisa saber que está lendo uma leitura, não a palavra do cliente.

Antes de 10/10 o áudio nem chegava aqui: o bot ignorava em silêncio (caso Marcia, 10/10).

## Mensagens automáticas no inbox — "🤖 Automático" (desde 04/10/2026)

Confirmado (+ resumo), saiu para entrega, pronto para retirada, cancelado, Pix novo, parabéns, o aviso ao motoboy
e a localização passam `registrar: { tipo, pedidoId, nome }` ao `/send` (`enviarWhatsAppBot`, `_botSend` direto e
`/send-location`), e o joeyapi grava na conversa como `autor:'sistema'` (desenho completo no CLAUDE.md do joeyapi).

- Bolha própria (`_wppBolhaAuto`): cinza tracejada, etiqueta "🤖 Automático · Pedido confirmado #36001", texto
  escapado, e o que vem depois da 1ª linha em branco (o resumo do pedido) **recolhido** em "ver resumo".
- Não marca a conversa como não lida (`_wppChaveVista` ignora as automáticas) e não toca som.
- O prazo da trava de "humano" é **15 min** desde 08/10 (era 30; 6h antes de 04/10) e não conta automática como equipe.

## Inbox: "equipe atendendo" no cabeçalho + bolha de campanha (desde 07/10/2026)

- Conversa em `status:'humano'` (v2): o aviso longo que ficava DENTRO da conversa (`#wppAviso`) saiu. O cabeçalho mostra
  "👤 Equipe atendendo · IA responde se o cliente escrever após HH:MM" (15 min depois da última mensagem da equipe) e, passado
  o horário, "· IA responde na próxima mensagem do cliente"; a explicação inteira fica no `title`. O `#wppAviso` só aparece
  para a pausa antiga (`pausaIaAte`), numa linha com "Retomar agora".
- ⚠️ **A IA não volta sozinha no horário**: o joeyapi só solta a trava quando chega mensagem do cliente
  (`liberaPorInatividade`). O 1º rótulo ("IA volta após HH:MM") passava a ideia contrária — Gabriela, 07/10.
- **Prazo único `IA_LIBERA_MS` = 15 min** (08/10/2026), o MESMO do joeyapi (`HUMANO_LIBERA_MS`) — mudou lá, muda aqui.
  `_wppLiberaTs(c)` é a única conta (cabeçalho e lista): última mensagem DA EQUIPE + prazo (sem nenhuma — "Assumir"
  sem escrever — a última que saiu da loja, como o servidor). Não usa `humanoEm`: o "Assumir" não grava.
- Selo da lista: passado o prazo, conversa `humano` mostra **"Bot"** (igual ao das outras, mesmo estilo; o "na próxima" fica só no cabeçalho) em vez de "Humano" — o `status` no banco
  só muda quando o cliente escreve (Larissa/Polly/Eliane, 08/10: "Humano" horas depois). A lista se refaz sozinha no
  próximo vencimento. "Aguardando" não muda. O job agendado que devolvia ao bot NÃO volta (gestaojoey-admin, 04/10).
- **`_wppHumanoAtivo(c)` é o ÚNICO intérprete de `status:'humano'` na tela** (humano E dentro do prazo): selo, badge do
  botão do WhatsApp (`_wppTemNaoLida`) e título da aba (`_wppAtualizarTitulo`). Badge e título também se refazem no vencimento.
  Exceção de propósito: o cabeçalho da conversa aberta lê o status cru e explica ("IA responde na próxima…"), e o botão
  "Devolver ao bot" segue valendo ali. 08/10: o badge mostrava 4 conversas que a lista já mostrava como Bot.
- Selo "⚠ Atenção" da lista: segue a regra da faixa (`_esperaDaConversa`) — some quando a equipe responde depois do
  `alertaEquipe` ou no fim do turno. Antes só saía com "Resolvido" (Beatriz, 07/10: atendida em 9 s, selo aceso 2 h).
  O banner "A IA pediu atenção" dentro da conversa usa a MESMA regra da faixa (`_wppHumanoDepois`): some quando
  alguém da equipe responde, sem precisar de "Resolvido" — ou quando o fato muda (abaixo). Antes olhava só o fato,
  e por isso ficava aceso depois de a equipe já ter resolvido (Larissa, 08/10: respondida 21:11-21:13, aviso vivo
  às 21:41). Cuidado: o caso `saiu` só se resolve pelo fato com `finalizado`, e o botão "Entreguei" do motoboy não
  é usado na prática — então, para esse caso, quem apaga o aviso é a resposta da equipe.
- **Aviso resolvido pelo fato** (`_wppAlertaResolvidoPeloFato`, PORTADA de joeyapi `alertaEquipe.alertaResolvidoPeloFato`):
  aviso da IA com `alertaEquipe.{pedidoId, caso}` some do banner, do selo e da faixa quando o pedido anda
  (`naoSaiu` → saiu/pronto p/ retirada/cancelado; `saiu` → finalizado/cancelado), pela automática na conversa ou pelo
  pedido em `pedidos` (já em memória). Caso Yasmim, 07/10: "ainda não saiu" na tela com o "saiu para entrega" logo abaixo.
- Campanha do celular (joeyapi `src/campanha.js`: mesmo conteúdo para 3+ contatos em 10 min) chega como `autor:'sistema'`,
  `auto.tipo:'campanha'` → bolha "📣 Campanha · não trava a IA". Não trava a IA nem conta como resposta à faixa abaixo.

## Faixa "cliente esperando a equipe" (desde 04/10/2026)

Nível 1 do alerta de conversa sem resposta (o nível 2, WhatsApp aos 5 min, é do joeyapi — `src/alertaEquipe.js`, com o
desenho completo no CLAUDE.md de lá). Caso: sábado 03/10, quatro clientes ouviram "já chamei a equipe" e ninguém respondeu.

- `_esperaDaConversa(conv)` — **portada** do `esperaDaConversa` do joeyapi; mudou lá, muda aqui. Espera = `aguardandoDesde`
  (a IA transferiu) ou `alertaEquipe.em` (a IA avisou sem transferir) sem mensagem `autor:'humano'` depois. Termina com
  resposta humana, "Devolver ao bot" ou "resolvido"; **não** termina quando a IA volta sozinha; **some no fim do turno,
  às 23:50 de SP** (`_esperaCorteDoTurno`) — espera de um turno que acabou não aparece no seguinte (em 04/10 de madrugada
  a faixa mostrava os 5 avisos de sábado, o mais antigo com 332 min).
- Aos **2 min**: `#esperaFaixa`, fixa no topo (z-index 1000, acima do painel do WhatsApp, abaixo dos modais), visível em
  qualquer aba. 1 cliente → nome, tempo e a última mensagem dele + [Abrir]; vários → contagem + [Ver ▾] com a lista.
  [Abrir] = `abrirWppPanel()` + `wppSelecionarConv(id)`. Recalcula a cada 15s em memória (nenhuma leitura nova).
- **Som**: um toque curto, diferente do de mensagem nova, **uma vez por espera**. Esperas já vencidas quando o painel abre
  não tocam (a faixa já está na tela).
- Abrir uma conversa grava `vistaEquipeEm` — é o que cancela o WhatsApp dos 5 min. A faixa continua até alguém RESPONDER.
- `config/loja.equipeAlertas` (`[{nome, tel}]`) — quem recebe o WhatsApp; sem tela de edição; está na lista de preservação
  do `salvarConfig`.

## "📍 Enviar localização" no balão do pedido (desde 03/10/2026)

No mapa de pedidos, o balão de cada pino tem botões que mandam a **localização nativa do WhatsApp** (a bolha com
mapa, via joeyapi `POST /send-location`, autenticado com o ID token do login) — `enviarLocalizacaoPedido()`:

- **ao motoboy atribuído** (só aparece com `entregadorId`; telefone lido de `motoboys/{id}.telefone`);
- **a cada pessoa de `config/loja.equipeLocalizacao`** — lista `[{ nome, tel }]`, hoje Fred (5521999981727) e
  Isabela (5521972116397), gravada direto no Firestore em 03/10. Não tem tela de edição: trocar/adicionar
  alguém é editar esse campo. ⚠️ O `salvarConfig` reescreve o doc inteiro — o campo está na lista de
  preservação; campo novo em `config/loja` precisa entrar lá também, senão o primeiro "Salvar" o apaga.
- Coordenada: **GPS do cliente → geocodificação**, a mesma do pino. Fora do GPS, precisão `aproximado`/`bairro`
  vai escrita no próprio nome do lugar ("(local aproximado)", "(portão do condomínio, não a casa)"); o nome é
  "Pedido #ID — Cliente" e o endereço "rua, nº · bairro (ref: …)".

## GPS do cliente no pedido (desde 03/10/2026)

No cardápio, em delivery, o botão **"📍 Estou no local — usar minha localização"** (em destaque, opcional) manda a
coordenada do celular JUNTO com o endereço digitado — não o substitui. Campos de topo **próprios** no pedido:
`gpsLat`, `gpsLng`, `gpsPrecisaoM`, `gpsEm` — nunca os `geo*`, que são da geocodificação do endereço.

- Descarta precisão pior que **100 m** (computador localiza por IP) e ponto a mais de **10 km** da loja (cliente não
  está no local). Negou/falhou/demorou → pedido segue normal, sem coordenada.
- A coordenada vive só em `_gpsEntrega`, para ESTE pedido — fora do `clienteData`, que vai pro localStorage e é
  reusado no próximo pedido.
- **Prioridade:** entregador (`destinoRota`) e mapa do painel usam GPS → geocodificação exata → texto. O entregador
  vê "📡 Localização enviada pelo cliente"; no mapa o pino tem anel azul e avisa quando o endereço geocodificado
  fica a mais de **300 m** do GPS.
- **Privacidade:** é a casa do cliente ao metro. O assessor (joey-secretário) só mostra `gps*` no nível
  `endereco` — a projeção de pedido de lá virou lista do que PODE sair (03/10). A Joey IA já projetava.
