CREATE TABLE IF NOT EXISTS public.recorrencias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao text NOT NULL,
    valor numeric(12, 2) NOT NULL CHECK (valor > 0),
    tipo text NOT NULL CHECK (tipo IN ('despesa', 'receita')),
    categoria text NOT NULL DEFAULT 'Outros',
    responsavel text NOT NULL,
    conta_origem text,
    dia_vencimento smallint NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
    data_inicio date NOT NULL,
    data_fim date,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

ALTER TABLE public.transacoes
    ADD COLUMN IF NOT EXISTS recorrencia_id uuid
        REFERENCES public.recorrencias(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mes_competencia date,
    ADD COLUMN IF NOT EXISTS status_pagamento text NOT NULL DEFAULT 'pago'
        CHECK (status_pagamento IN ('pago', 'pendente'));

CREATE UNIQUE INDEX IF NOT EXISTS transacoes_recorrencia_mes_uidx
    ON public.transacoes (recorrencia_id, mes_competencia);
CREATE INDEX IF NOT EXISTS transacoes_recorrencia_id_idx
    ON public.transacoes (recorrencia_id);

ALTER TABLE public.contas_agendadas
    ADD COLUMN IF NOT EXISTS serie_id uuid,
    ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;

WITH series_existentes AS (
    SELECT
        id,
        first_value(id) OVER (
            PARTITION BY descricao_normalizada, tipo, valor, ordem_no_mes
            ORDER BY data_vencimento, id
        ) AS serie_id
    FROM (
        SELECT
            id,
            data_vencimento,
            lower(trim(descricao)) AS descricao_normalizada,
            tipo,
            valor,
            row_number() OVER (
                PARTITION BY lower(trim(descricao)), tipo, valor,
                             date_trunc('month', data_vencimento)
                ORDER BY data_vencimento, id
            ) AS ordem_no_mes
        FROM public.contas_agendadas
        WHERE recorrente = true AND serie_id IS NULL
    ) AS contas_ordenadas
)
UPDATE public.contas_agendadas AS conta
SET serie_id = series_existentes.serie_id
FROM series_existentes
WHERE conta.id = series_existentes.id;

CREATE UNIQUE INDEX IF NOT EXISTS contas_agendadas_serie_vencimento_uidx
    ON public.contas_agendadas (serie_id, data_vencimento);
CREATE INDEX IF NOT EXISTS contas_agendadas_serie_id_idx
    ON public.contas_agendadas (serie_id);

CREATE TABLE IF NOT EXISTS public.orcamentos_categoria (
    mes_referencia date NOT NULL,
    categoria text NOT NULL,
    limite numeric(12, 2) NOT NULL CHECK (limite > 0),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (mes_referencia, categoria)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.recorrencias,
    public.orcamentos_categoria,
    public.transacoes,
    public.contas_agendadas
TO anon, authenticated;

DO $$
DECLARE
    tabela text;
BEGIN
    FOREACH tabela IN ARRAY ARRAY[
        'recorrencias',
        'orcamentos_categoria',
        'transacoes',
        'contas_agendadas'
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
