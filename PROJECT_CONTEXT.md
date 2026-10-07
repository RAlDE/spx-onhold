# PROJECT_CONTEXT — SPX OnHold

Atualizado em: 2026-10-06
Repositório: RAlDE/spx-onhold
Versão atual do módulo: 0.3.24

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
- 0.3.10: ampliada a busca de eventos "Em entrega", mas o dia ainda não apareceu no teste real.
- 0.3.11: tentativa de corrigir abertura da lista, mas introduziu erro de sintaxe no template de seta (linha 1391); Chrome não carregava o módulo.
- 0.3.12: corrigida a expressão da seta na linha 1391. Aguardando teste no Chrome para confirmar carregamento e abertura da lista. Dia da rota continua pendente de identificação do campo exato da SPX.

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

- 0.3.13: recuperação emergencial. Restaurado integralmente o módulo estável de 0.3.8, alterando apenas a indicação da versão para 0.3.13. A tentativa de exibir o dia da rota e as mudanças da seta de 0.3.9–0.3.12 foram revertidas. Aguardar confirmação em navegador antes de retomar as melhorias.

- 0.3.14: a pedido do usuário, usando código estável 0.3.13 como base, apenas acrescentado o dia da semana ao lado da AT, derivado dos 8 dígitos YYYYMMDD após 'AT' (ex.: AT20261006... — terça-feira). Não faz consultas adicionais e preserva a seta de ocorrências. Código validado sintaticamente e cálculos testados. Usuário confirmou em 06/10/2026 que a v0.3.14 funcionou no Chrome e exibiu o dia corretamente. Considerar v0.3.14 a versão estável atual e preservar esse comportamento nas próximas melhorias.


- 0.3.15: substitui o dia derivado da data da AT pelo dia real em que o motorista recebeu a rota. O módulo consulta `tracking_info` do BR pesquisado, procura eventos "Em entrega" / "Pedido em processo de entrega" (ou equivalentes), e prioriza o evento que contém o ID do motorista atual; se necessário, usa o nome do motorista. Somente se houver correspondência segura exibe o dia da semana ao lado da AT. A data da AT não é mais usada como fallback. Mantidos os demais comportamentos estáveis da 0.3.14, inclusive seta de ocorrências. Teste sintático e teste local com dois motoristas/eventos executados com sucesso; validação real no SPX ainda pendente.


- 0.3.16: ajuste do critério do dia real da rota. A identificação do momento em que o motorista recebeu a rota agora considera somente o status interno `Delivering`. Removidos os critérios "Em entrega", "Pedido em processo de entrega" e "Out for delivery" da detecção. Continua sendo priorizada a correspondência pelo ID do motorista atual e, em seguida, pelo nome. Não há fallback pela data da AT.


- 0.3.17: corrigido o estado da lista de ocorrências para permanecer aberta durante atualizações/re-renderizações do painel. A seta agora reflete o estado persistido e é resetada apenas ao bipar um novo BR. Também ampliada a detecção do status interno `Delivering` para considerar o conteúdo JSON completo do objeto/evento, incluindo casos em que o status fica aninhado em blocos internos. Continua sem usar a data da AT como fallback. Sintaxe validada antes da publicação; teste real no SPX ainda pendente.


- 0.3.18: reconstruída a partir da versão estável 0.3.14 para não interferir mais na seta das ocorrências. A lógica da seta/lista foi restaurada exatamente ao comportamento da 0.3.14. O dia real da rota foi separado para uma linha própria ("Dia da rota: ...") e sua consulta não chama mais `renderDriver`, evitando recriar o painel por causa do dia. A detecção usa somente o status interno `Delivering`, procura o motorista atual pelo ID e depois pelo nome, e não usa a data da AT como fallback. Corrigida também a detecção de `Delivering` quando ele vem entre aspas dentro do JSON. Sintaxe validada antes da publicação; teste real no SPX pendente.


- 0.3.19: regra do "Dia da rota" simplificada conforme esclarecimento do usuário. A informação é obtida exclusivamente pelo BR pesquisado: consulta `tracking_info`, localiza todos os eventos com status interno `Delivering`, seleciona o evento de maior data/hora e converte essa data para o dia da semana em America/Sao_Paulo. Não cruza com AT, motorista, ocorrências OnHold ou seta; essas partes ficam independentes. Teste local com dois eventos Delivering confirmou seleção do mais recente.


- 0.3.20: sem alterar a lógica funcional do dia da rota nem das ocorrências, foi ampliado apenas o diagnóstico. O botão "i" agora mostra uma seção "Fonte Delivering" com endpoint capturado, quantidade de Delivering/OnHold e amostras de status/horário/chaves. "Requisições candidatas" também passa a indicar se cada resposta contém a palavra Delivering. Objetivo: identificar o campo real usado pela SPX antes de novas mudanças na regra.


- 0.3.21: diagnóstico refinado após teste real da 0.3.20. O endpoint tracking_info é consultado, mas a resposta não contém a palavra literal Delivering. Foi adicionada a seção Tracking info bruto no botão i, listando campos e valores ligados a status, state, event, message, description, title, horário, data, driver, operador e rota. Objetivo: identificar o campo interno que a SPX usa para montar o rótulo visual Em entrega. Nenhuma alteração feita na seta ou na lógica das ocorrências.


- 0.3.22: o cálculo do Dia da rota passou a fazer varredura de todos os objetos retornados por tracking_info. Não depende mais da palavra literal Delivering. Considera como Delivering tanto valor textual 'Delivering' quanto código interno 2 quando presente em campos de status/state. Entre todos os eventos candidatos, usa o maior horário válido e converte para o dia da semana em America/Sao_Paulo. Não usa AT, motorista, ocorrências ou seta para esse cálculo. A lógica da seta/ocorrências não foi alterada. Teste local com múltiplos eventos confirmou seleção do status 2 mais recente.


- 0.3.23: mantém a regra da 0.3.22 e passa a exibir também a hora do mesmo evento mais recente identificado como Delivering. Exibição: `Dia da rota: <dia-da-semana> — HH:mm`, sempre em America/Sao_Paulo. Objetivo: permitir conferir visualmente se o horário usado pelo OnHold corresponde ao histórico real do BR. Nenhuma alteração feita na seta ou na lógica das ocorrências.


- 0.3.24: ajuste apenas de exibição do Dia da rota. Mantém a lógica da 0.3.23, remove o traço entre dia e horário e passa a mostrar segundos. Formato atual: `Dia da rota: quarta-feira 15:00:32`. Nenhuma alteração feita na seta, ocorrências ou regra de identificação do último Delivering.


- 0.3.24 validada em teste real no SPX em 07/10/2026: o dia da rota e o horário com segundos exibidos pelo módulo bateram com o histórico real do BR. Esta versão passa a ser a referência estável para a lógica de identificação do último Delivering e exibição de `Dia da rota: <dia-da-semana> HH:mm:ss`.
