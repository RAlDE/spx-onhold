# SPX OnHold — pesquisa PT/EN, status Return e AT (18/11/2026)

> **Estado:** diagnóstico de código e testes locais; **nenhum ajuste do módulo foi publicado neste registro**. Versão vigente confirmada no GitHub: `0.3.28` (módulo e catálogo). A v0.3.28 já foi confirmada pelo usuário em teste real em inglês para o reconhecimento da tabela. Validar a futura correção da classificação de Return separadamente.

## Origem e continuidade

- Após confirmar que o SPX pode devolver uma resposta inglesa de `tracking_info` com a interface ainda em português, o usuário pediu continuar a pesquisa **priorizando o SPX OnHold**; deixar o SPX-DV sem alterações.
- Evidência principal de idioma e AT na conversa: no BR `BR2659468678763`, os eventos `119` e `120` de `tracking_info` mostram a AT `AT20261118D0T4N` em inglês, mas não em português. Quando os cookies de preferência `spx-admin-lang=en` e `spx-lang=en` estavam ajustados juntos, a tela permaneceu visivelmente em português e uma chamada GET retornou os eventos em inglês (HTTP 200). Qual cookie é suficiente isoladamente não foi comprovado.
- Handoff com detalhes e ressalvas: [SPX-DV / HANDOFF_2026-11-18_AT_RETURN_IDIOMA_PT_EN.md](https://github.com/RAlDE/spx-dv/blob/main/HANDOFF_2026-11-18_AT_RETURN_IDIOMA_PT_EN.md). A referência cruzada **não autoriza modificar o SPX-DV**.

## Observação importante: OnHold já encontra a AT na tabela

- No módulo `modules/spx-onhold/spx-onhold.js`, `readSingleAssignment()` lê a `AT` e o motorista na tabela `#/delivery-assignment/list` pelos cabeçalhos PT ou EN, corrigidos na v0.3.28. Essa função **não depende de extrair a AT da mensagem do rastreio**.
- Portanto, para o objetivo atual do OnHold, **não precisamos modificar cookies de idioma, adicionar permissão de cookies ou solicitar respostas inglesas**. A descoberta da AT em inglês continua útil para outros fluxos, porém não é requisito para corrigir os totais/listas OnHold.
- `extension/manifest.json` hoje só pede `storage` e `userScripts`, não `cookies` ou `declarativeNetRequest`. Alterar cookies globalmente seria uma mudança invasiva e pode interferir no SPX aberto. Não propor esse caminho como mudança pontual.
- O navegador não permite à página setar arbitrariamente o cabeçalho `Cookie` de um `fetch` comum. Header `Accept-Language` isolado foi testado e não resolveu. Não prometer consulta inglesa isolada sem demonstrar mecanismo efetivo e sem aumentar riscos.

## Defeito reproduzido no classificador do OnHold v0.3.28

O código atual da função `trackingNodeCategory(node)` reconhece a mensagem **portuguesa** de evento `124`, mas não sua equivalente **inglesa**; em ambos os casos a leitura deveria depender do status operacional do evento, de preferência numérico e textual de maneira compatível nos dois idiomas.

| Teste sintético baseado em evento real | Status | Resultado esperado | Resultado atual local |
|---|---|---|---|
| `Pedido em devolução ao vendedor` | `124` | `return_returning` | `return_returning` |
| `Parcel returning to seller` | `124` | `return_returning` | **`other` — FALHA** |
| `Devolução em espera: [Endereço não encontrado]` | `126` | `return_onhold` | `return_onhold` |
| `Pedido devolvido` | `125` | `other` | `other` |
| `Parcel returned` | `125` | `other` | `other` |
| Status `120`, atribuição PT ou EN | `120` | `other` | `other` |

Os exemplos foram executados contra **as funções reais extraídas do arquivo do GitHub**, usando objetos simulados que preservam o formato do endpoint. **Não houve execução autenticada no SPX** neste teste. Se `order/search` trouxer o status textual completo, o OnHold poderá classificá-lo corretamente; a falha importa especialmente quando o código cai no fallback do `tracking_info`.

### Outro efeito reproduzido: Dia da rota do Return

- A função `realRouteWeekday(tracking)` usa `nodeRepresentsDelivering(node)`, que hoje considera apenas nome `Delivering` ou código numérico `2`.
- Teste local: `status=2` devolveu dia/hora; `status=124` com mensagem PT ou EN devolveu string vazia. Em BR com Delivering normal antigo e Return recente, há risco de mostrar o dia antigo em vez do dia do retorno; ainda não validado em produção.
- Isso é independente do cabeçalho de tabela em inglês já corrigido na v0.3.28.

## Regras de negócio já confirmadas pelo usuário

- Em rota: `Delivering` (normal) e `Return_LMHub_Returning` / `Retorno_LMHub_Retornando` (Return, exemplificado pelo status de rastreio `124`).
- Ocorrências: `OnHold` (normal) e `Return_LMHub_Onhold` / `Retorno_LMHub_Em_Espera` (Return, exemplificado pelo status de rastreio `126`).
- `119` e `120`: atribuição; não significam ocorrência nem retorno em rota por si mesmos. `125`: devolvido/concluído; não é Return em rota ou em espera.
- Vale **o último evento operacional pertinente** e a evidência atual de cada BR, não a presença de ocorrências antigas. Em caso de empate/códigos desconhecidos, privilegiar classificação cautelosa e diagnóstico, não contabilizar à força.

## Próximas etapas sugeridas (ainda NÃO implementadas)

1. Em revisão pontual do OnHold, classificar os eventos Return com os **códigos e estados operacionais observados** (`124`, `126`, `125`, `119`, `120`), preservando os status normais `2` e `5`. Tratar idioma PT/EN sem depender de strings traduzidas.
2. Reaproveitar essa lógica no cálculo do Dia da rota de Return sem alterar o cálculo normal que o usuário já validou. Evitar usar Delivering antigo como se fosse a saída recente de Return.
3. Testar com sequência de eventos: `126` antigo → `119/120` → `124` atual; `124` → `126` atual; `124` → `125`; e com status desconhecidos, retornos completos e mesmo BR em mais de um ciclo.
4. Verificar novamente os SHAs de módulo, catálogo e contexto antes da alteração; versão nova só após ajustes restritos, testes locais e revisão do diff. Validação local **não** significa teste real do SPX.
5. Manter separados SPX-DV, integrações de recebimento, Dashboard e outras extensões. Este handoff não pede alteração no SPX-DV.

## Segurança e materiais

- Registro contém apenas status/código/AT de exemplo e configuração não autenticadora de idioma. **Não contém cookies de sessão, tokens, assinaturas, IDs privados da sessão ou respostas brutas sensíveis.**
- Não solicitar novamente o header completo `Cookie`. Caso se planeje testar cookies, fazê-lo apenas em contexto autorizado e sem expor a sessão. Para o conserto de status OnHold, os dados estruturados disponíveis bastam para iniciar testes locais.

## Registro incremental

- **18/11/2026:** inspeção do OnHold v0.3.28 e testes locais de status `124` PT vs EN e do Dia da rota. Falha real no parser local identificada; causa técnica e plano documentados. Código operacional intacto. Próximo registro deve trazer correção proposta/efetivada, testes e validação do operador, com commit correspondente.

- **18/11/2026 — 0.3.29:** publicado ajuste pontual no classificador de `tracking_info` para códigos Return `124` (em rota), `126` (em espera), `119/120` (atribuição) e `125` (concluído), com reconhecimento textual complementar de `Parcel returning to seller`. `Dia da rota` passa a considerar o evento Return `124` além do `Delivering 2`. Testes locais: 25/25; compilação JS passou. **Não testado no SPX real ainda.** AT da tabela inalterada; o rastreio pt-BR ainda não inclui AT na mensagem, portanto nenhuma captura histórica automática foi adicionada. Nenhum cookie, Dashboard, SPX-DV, API externa ou permissão mudou.


## Teste controlado dos cookies de idioma — Teste A

**Data da captura:** 18/11/2026, sessão do usuário. **Origem:** print do Console Chrome e configuração explicitada pelo usuário. **Somente documentação — extensão intocada.**

- Contexto: mesma página de rastreio `BR2659468678763` com interface ainda em português; chamadas `GET /api/fleet_order/order/detail/tracking_info?shipment_id=BR2659468678763` via `fetch` autenticado no Console.
- **Teste A:** `spx-admin-lang=en` e `spx-lang=pt-BR` (conforme o usuário). Resultado mais recente mostrado na **tabela inferior** do Console: `HTTP 200`, eventos `119` e `120` com mensagens **em português**, e AT `Não encontrada` para ambos.
- A **tabela superior**, ainda visível no mesmo Console, preservava o resultado do teste anterior com ambos os cookies `en`, que gerou mensagens inglesas e `AT20261118D0T4N`. Não confundir a tabela superior com o resultado do Teste A.
- **Conclusão limitada:** `spx-admin-lang=en` isoladamente, mantendo `spx-lang=pt-BR`, **não foi suficiente** para obter a AT no texto. Isso aumenta a plausibilidade de `spx-lang` ser determinante, mas **não comprova** o efeito dele sozinho e não elimina influência de outras condições da sessão.
- **Teste B realizado e registrado:** ver seção seguinte. Não publicar cabeçalhos completos ou tokens.
- Restaurar ao fim `spx-admin-lang=pt-br` e `spx-lang=pt-BR`. Esse teste **não implementa** troca de idioma na extensão; qualquer eventual solução deve isolar requisições e evitar interferência na sessão.

## Teste controlado dos cookies de idioma — Teste B

**Data:** 18/11/2026, comprovante visual da execução no Console enviado pelo usuário. **BR:** `BR2659468678763`.

- **Configuração informada pelo usuário para o Teste B:** `spx-admin-lang=pt-br`; `spx-lang=en`.
- A interface aberta continuou exibindo **Português**.
- A consulta `GET /api/fleet_order/order/detail/tracking_info?shipment_id=BR2659468678763`, executada novamente com `fetch` da própria página, retornou **HTTP 200**.
- A **tabela inferior (resultado novo)** mostrou mensagens em inglês para o status `119` (`Parcel adding into Assignment Task AT20261118D0T4N`) e `120` (`Parcel added into Assignment Task AT20261118D0T4N`), ambas com a AT **`AT20261118D0T4N`** na coluna extraída.
- A **tabela superior** no print era resultado anterior do Teste A (`spx-admin-lang=en`, `spx-lang=pt-BR`), com mensagens em português e AT `Não encontrada`. Não confundir ambas.

| Teste | `spx-admin-lang` | `spx-lang` | Idioma do `message` | AT |
|---|---|---|---|---|
| Ambos en (teste anterior) | `en` | `en` | inglês | `AT20261118D0T4N` |
| **A** | `en` | `pt-BR` | português | ausente |
| **B** | `pt-br` | `en` | inglês | `AT20261118D0T4N` |

**Conclusão experimental:** na sessão e no endpoint testados, o valor `spx-lang=en` foi **suficiente** para obter o texto inglês com a AT, mesmo mantendo `spx-admin-lang=pt-br`; ao contrário, `spx-admin-lang=en` com `spx-lang=pt-BR` não bastou. Essa comparação fornece forte evidência de que **`spx-lang` determina a localização do texto de `tracking_info`** neste fluxo.

**Limites / próximos passos:** o teste não identifica o algoritmo interno, nem garante comportamento de outros endpoints. Principalmente **não** demonstra que a extensão possa pedir idioma inglês em uma chamada isolada sem modificar cookies globais da sessão. `fetch` no navegador não aceita definir manualmente o header `Cookie`; não adotar rotação automática de cookies como solução de produção. Considerar endpoints estruturados BR/VT/AT, ou outro mecanismo autorizado e comprovado de seleção de idioma por requisição. Preservar no OnHold a AT da tabela de assignment como fonte da AT atualmente selecionada e não atribuir uma AT histórica do rastreio ao motorista errado.

**Segurança e restauração:** após testar, restaurar `spx-admin-lang=pt-br` e `spx-lang=pt-BR`. Não coletar, armazenar nem publicar cookies de autenticação ou tokens. **Código OnHold 0.3.29 e SPX-DV não modificados por este registro.**
