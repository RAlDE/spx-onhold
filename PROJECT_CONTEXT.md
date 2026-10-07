# PROJECT_CONTEXT — SPX OnHold

Atualizado em: 2026-10-06
Repositório: RAlDE/spx-onhold
Versão atual do módulo: 0.3.10

## Objetivo
Projeto separado do SPX-DV. Extensão Chrome criada para apoiar a consulta de OnHold/Return_LMHub_Onhold dentro da página de assignments da SPX.

IMPORTANTE: não misturar código, regras ou arquivos com o repositório `RAlDE/spx-dv`.

## Estrutura principal
- `catalog.json`: catálogo e versão do módulo.
- `extension/`: loader Chrome.
- `modules/spx-onhold/spx-onhold.js`: módulo principal.
- Página alvo principal:
  `https://spx.shopee.com.br/#/delivery-assignment/list`

## Interface
- Caixa principal movível.
- Cabeçalho laranja e corpo preto.
- Botão lateral "OnHold" para abrir/fechar.
- Mostra:
  - motorista;
  - ID;
  - AT;
  - BR pesquisado;
  - totais de OnHold/Return_LMHub_Onhold;
  - total "Em rota" quando maior que zero;
  - lista de ocorrências com data, hora e motivo traduzido.

## Fluxo de pesquisa
O operador bipa um BR no campo "SLPS num de rastreamento".
O módulo espera a linha filtrada da assignment aparecer e então identifica os dados da AT/driver.

Foi corrigido um problema em que a primeira bipagem podia capturar uma linha antiga. O módulo registra a assinatura anterior da assignment e aguarda a atualização quando necessário.

## Endpoint de pedidos da AT
Endpoint usado para percorrer todos os pedidos de uma assignment:
`/spx_delivery/admin/assignment/assignment_task/detail/order/search?assignment_task_id=<AT>&pageno=<pagina>&count=24`

Estrutura relevante da resposta:
- `data.list`
- `data.total`
- `data.pageno`
- `data.count`

A varredura percorre automaticamente todas as páginas para calcular os totais reais da AT.

## Mapeamento de status importante
- 2 = Delivering
- 4 = Delivered
- 5 = OnHold
- 10 = Return_LMHub_Onhold

Regra de contagem:
- Status 5 e status 10 entram na contagem de ocorrências OnHold/retorno.
- "Em rota" corresponde ao status 2 e só deve aparecer quando o total for maior que zero.

## Histórico das ocorrências
Para BRs OnHold, o módulo usa o mesmo endpoint de recipient usado no SPX-DV:
`/api/fleet_order/order/detail/recipient_info?shipment_id=<BR>&station_type=3`

Lê `recipient.On_Hold` e usa `ctime` para data/hora.

Para Return_LMHub_Onhold, quando não existe informação suficiente em `recipient.On_Hold`, existe fallback pelo tracking:
`/api/fleet_order/order/detail/tracking_info?shipment_id=<BR>`

O código procura eventos relacionados a:
- Retorno_LMHub_Em_Espera
- Return_LMHub_Onhold
- eventos equivalentes de retorno usados pela SPX

## Traduções
O módulo reaproveita a lógica de tradução de motivos utilizada no projeto SPX-DV e remove códigos do tipo `[R###]` da exibição quando necessário.

## Diagnóstico
Existe botão compacto "i" com seções em `<details>`:
- Resumo
- Order Search
- Mapa de Status
- Status da AT
- Varredura do BR
- Requisições candidatas

A ideia é permitir depuração sem poluir a interface principal.

## Versionamento recente
- 0.3.0: ajustes de exibição da AT/BR.
- 0.3.1: correção da primeira bipagem/linha antiga.
- 0.3.3: diagnóstico reorganizado em accordions.
- 0.3.5: status 10 identificado como Return_LMHub_Onhold e incorporado à contagem.
- 0.3.6: removido toast de atualização dos totais.
- 0.3.7: removido toast de detecção de Return_LMHub_Onhold.
- 0.3.8: removido toast de códigos de status.
- 0.3.9: primeira tentativa de exibir dia de "Em entrega" ao lado da AT. No teste com AT20261006APVS7 o dia não apareceu.
- 0.3.10: leitura mais abrangente de eventos e campos de tempo do tracking_info para localizar "Em entrega". Continua sem inventar dia quando não consegue identificar o evento com segurança. Pendente validar com pacote real.

## Cuidados para futuras alterações
- Este projeto é independente do SPX-DV.
- Não modificar `RAlDE/spx-dv` ao trabalhar neste projeto, a menos que o usuário peça explicitamente.
- Manter a varredura de todas as páginas da AT; não contar apenas a primeira página.
- Status 10 deve continuar sendo reconhecido como Return_LMHub_Onhold.
- Não exibir "Em rota" quando o total for zero.
- Preservar a correção de espera da linha nova na primeira bipagem.
- Evitar toasts de diagnóstico que atrapalhem o operador.
- Antes de editar, conferir a versão atual em `spx-onhold.js` e `catalog.json` e manter ambos sincronizados.
- Este arquivo é documentação apenas e não participa da execução da extensão.
