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
