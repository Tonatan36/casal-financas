# Finanças do Casal

Aplicação web responsiva para acompanhar receitas e despesas compartilhadas. A interface é estática (HTML, CSS/Tailwind e JavaScript) e usa Supabase como banco de dados e canal de sincronização.

## Recursos

- Lançamentos de receitas e despesas, filtros e exportação CSV.
- Dashboard com receitas, despesas, saldo, categorias e gráficos mensais.
- Planejamento do mês com rendas de Ewerton e Blenda, renda familiar e despesas previstas.
- Séries recorrentes mensais para salários e despesas. O app gera somente a competência solicitada, relaciona cada lançamento à sua série e usa uma chave única no banco para não duplicar ocorrências. As séries podem ser pausadas e retomadas.
- Contas a pagar e receber com vencimento, recorrência, status pago/pendente e avisos para vencidas ou com vencimento nos próximos três dias.
- Orçamentos mensais por categoria com alerta visual a partir de 80% do limite.
- Cartões, limite usado/disponível, fechamento, vencimento, faturas e parcelas futuras.
- Metas compartilhadas, dívidas/financiamentos e projeções.
- Supabase Realtime para atualizar os dados entre dispositivos.
- PWA instalável. A sincronização de dados exige conexão com a internet.

## Configuração

1. Configure o projeto Supabase e confira `SUPABASE_URL` e `SUPABASE_ANON_KEY` no início de `app.js`. Use somente a chave pública `anon` no navegador; nunca inclua uma chave `service_role` no frontend.
2. No SQL Editor do Supabase, aplique as migrações em ordem:
   - `migrations/20261110_financeiro_melhorias.sql`
   - `migrations/20261112_planejamento_financeiro.sql`
   - `migrations/20261113_recorrencias_orcamentos.sql`
3. Sirva a pasta por HTTP, por exemplo:

   ```sh
   python3 -m http.server 8000
   ```

   Acesse `http://localhost:8000`. Para publicação, use HTTPS para permitir o service worker e as notificações.

As migrações adicionam as tabelas e colunas necessárias e incluem as tabelas em `supabase_realtime`. Se o projeto Supabase tiver regras de acesso diferentes das permissões padrão, ajuste os grants e as políticas RLS de acordo com o método de autenticação usado.

## Uso de recorrências

- Em **Recorrências inteligentes**, cadastre descrição, valor, tipo (despesa ou receita), categoria, responsável, início, dia de vencimento e, opcionalmente, último mês.
- Ao entrar no app, são criadas as ocorrências elegíveis do mês atual. O botão **Gerar recorrências do mês selecionado** permite gerar outro mês; executar novamente não duplica lançamentos.
- Cada transação recorrente guarda `recorrencia_id` e `mes_competencia`, além do status pago/pendente. É possível pausar e retomar a série. O status pode ser alterado na lista de lançamentos.
- Contas fixas da agenda também podem ser marcadas como recorrentes. A próxima ocorrência é gerada ao marcar a conta como paga; ao abrir o app ou usar o botão mensal, o sistema completa o mês selecionado sem duplicar, protegido por `serie_id` e data de vencimento.
- O dia escolhido é limitado ao último dia do mês quando o mês tiver menos dias (por exemplo, dia 31 em fevereiro).

## Orçamentos e avisos

- O orçamento é associado ao mês selecionado no filtro de lançamentos e à categoria escolhida.
- O gasto da categoria é comparado com a soma dos lançamentos de despesa daquele mês. A interface destaca o orçamento a partir de 80% e limita a barra visual a 100%.
- Os avisos de contas aparecem no app para itens vencidos e para vencimentos nos próximos três dias. Notificações do navegador exigem permissão e são emitidas quando o app está aberto; não há serviço de push em segundo plano.

## Dados e limitações

- A projeção de quitação de dívidas é uma estimativa simples baseada no saldo devedor dividido pelo pagamento mensal; não considera juros, multas ou amortização variável.
- A senha numérica exibida na tela é apenas uma barreira visual implementada no cliente, não autentica o usuário no Supabase. O uso com dados financeiros reais deve ser protegido por autenticação Supabase e políticas RLS adequadas.
- O app carrega Tailwind CSS e o cliente Supabase por CDN.

## Validação local

Não há suíte de testes automatizada configurada. Para uma verificação rápida de sintaxe JavaScript:

```sh
node --check app.js
```
