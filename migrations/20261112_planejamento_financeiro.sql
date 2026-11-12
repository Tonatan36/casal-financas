ALTER TABLE public.transacoes
    ADD COLUMN IF NOT EXISTS fatura_mes text;

CREATE TABLE IF NOT EXISTS public.cartoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL UNIQUE,
    limite_total numeric(12, 2) NOT NULL CHECK (limite_total > 0),
    dia_fechamento smallint NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
    dia_vencimento smallint NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
    criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contas_agendadas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao text NOT NULL,
    valor numeric(12, 2) NOT NULL CHECK (valor > 0),
    tipo text NOT NULL CHECK (tipo IN ('despesa', 'receita')),
    data_vencimento date NOT NULL,
    recorrente boolean NOT NULL DEFAULT false,
    pago boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.metas_compartilhadas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    valor_alvo numeric(12, 2) NOT NULL CHECK (valor_alvo > 0),
    valor_atual numeric(12, 2) NOT NULL DEFAULT 0 CHECK (valor_atual >= 0),
    criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dividas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    saldo_devedor numeric(12, 2) NOT NULL CHECK (saldo_devedor >= 0),
    pagamento_mensal numeric(12, 2) NOT NULL CHECK (pagamento_mensal > 0),
    criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planejamento_mensal (
    mes_referencia date PRIMARY KEY,
    renda_ewerton numeric(12, 2) NOT NULL DEFAULT 0 CHECK (renda_ewerton >= 0),
    renda_blenda numeric(12, 2) NOT NULL DEFAULT 0 CHECK (renda_blenda >= 0),
    despesas_previstas numeric(12, 2) NOT NULL DEFAULT 0 CHECK (despesas_previstas >= 0),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faturas_cartao (
    cartao_id uuid NOT NULL REFERENCES public.cartoes(id) ON DELETE CASCADE,
    mes_referencia date NOT NULL,
    status text NOT NULL CHECK (status IN ('aberta', 'fechada', 'paga')),
    paga_em date,
    PRIMARY KEY (cartao_id, mes_referencia)
);

CREATE INDEX IF NOT EXISTS contas_agendadas_vencimento_idx
    ON public.contas_agendadas (data_vencimento);
CREATE INDEX IF NOT EXISTS transacoes_fatura_mes_idx
    ON public.transacoes (fatura_mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.cartoes,
    public.contas_agendadas,
    public.metas_compartilhadas,
    public.dividas,
    public.planejamento_mensal,
    public.faturas_cartao
TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transacoes TO anon, authenticated;

DO $$
DECLARE
    tabela text;
BEGIN
    FOREACH tabela IN ARRAY ARRAY[
        'transacoes',
        'cartoes',
        'contas_agendadas',
        'metas_compartilhadas',
        'dividas',
        'planejamento_mensal',
        'faturas_cartao'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = tabela
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tabela);
        END IF;
    END LOOP;
END
$$;
