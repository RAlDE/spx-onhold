# SPX OnHold

Extensão Chrome independente para apoiar a consulta de atribuições de entrega no SPX.

## Objetivo

Na página `https://spx.shopee.com.br/#/delivery-assignment/list`, ao bipar um BR:

- identificar motorista e ID quando houver atribuição ativa;
- contar somente pedidos `OnHold` e `Delivering` da atribuição;
- exibir uma caixa móvel;
- permitir abrir/fechar a caixa;
- mostrar o último OnHold e expandir todas as datas/horários;
- mostrar `Sem informação` quando não houver atribuição ativa.

## Segurança

O projeto não armazena senha, cookie ou token. Ele usa somente a sessão já autenticada no navegador e deve respeitar as permissões concedidas pelo SPX.
