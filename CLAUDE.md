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

## Extrato bancário (⑧ da aba Financeiro do gestao-joey.html) — **só o tenant joey**

Feature **em construção**, travada no slug `joey`: outro tenant não vê a seção, nem o upload, nem a conciliação. **Não altera o cálculo do lucro** — é conferência entre extrato e compras lançadas.

A seção segue o filtro de período que a aba Financeiro já tem (`_finPeriodRange`) — **não criar um segundo controle de data**. Renderiza no fim de `_finUpdate`, no mesmo padrão das outras: `<div class="section-title">` + `<div id="...Container">`.

Lembre que `gestao-joey.html` existe em **duas cópias** que precisam ficar idênticas (ver [gestao-joey dual deploy]) e que ele **não carrega o SDK de Storage** hoje — só `firebase-app`, `firestore` e `auth`.

O resto (regras de Storage, parser, Cloud Functions, `external_reference`) está documentado no `CLAUDE.md` do **gestaojoey-admin**.

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

- Faixa `#plantaoBar` no topo do kanban (só joey): um chip por motoboy ativo, toque liga/desliga
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

## Mensagens automáticas no inbox — "🤖 Automático" (desde 04/10/2026)

Confirmado (+ resumo), saiu para entrega, pronto para retirada, cancelado, Pix novo, parabéns, o aviso ao motoboy
e a localização passam `registrar: { tipo, pedidoId, nome }` ao `/send` (`enviarWhatsAppBot`, `_botSend` direto e
`/send-location`), e o joeyapi grava na conversa como `autor:'sistema'` (desenho completo no CLAUDE.md do joeyapi).

- Bolha própria (`_wppBolhaAuto`): cinza tracejada, etiqueta "🤖 Automático · Pedido confirmado #36001", texto
  escapado, e o que vem depois da 1ª linha em branco (o resumo do pedido) **recolhido** em "ver resumo".
- Não marca a conversa como não lida (`_wppChaveVista` ignora as automáticas) e não toca som.
- O aviso de "humano" diz **30 min** (era 6h; a regra do joeyapi mudou em 04/10) e não conta automática como equipe.

## Inbox: "equipe atendendo" no cabeçalho + bolha de campanha (desde 07/10/2026)

- Conversa em `status:'humano'` (v2): o aviso longo que ficava DENTRO da conversa (`#wppAviso`) saiu. O cabeçalho mostra
  "👤 Equipe atendendo · IA responde se o cliente escrever após HH:MM" (30 min depois da última mensagem da equipe) e, passado
  o horário, "· IA responde na próxima mensagem do cliente"; a explicação inteira fica no `title`. O `#wppAviso` só aparece
  para a pausa antiga (`pausaIaAte`), numa linha com "Retomar agora".
- ⚠️ **A IA não volta sozinha no horário**: o joeyapi só solta a trava quando chega mensagem do cliente
  (`liberaPorInatividade`). O 1º rótulo ("IA volta após HH:MM") passava a ideia contrária — Gabriela, 07/10.
- Selo "⚠ Atenção" da lista: segue a regra da faixa (`_esperaDaConversa`) — some quando a equipe responde depois do
  `alertaEquipe` ou no fim do turno. Antes só saía com "Resolvido" (Beatriz, 07/10: atendida em 9 s, selo aceso 2 h).
  O banner "A IA pediu atenção" dentro da conversa continua até "Resolvido" — ou até o fato mudar (abaixo).
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
