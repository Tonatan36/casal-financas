ALTER TABLE public.transacoes
    ADD COLUMN IF NOT EXISTS data_lancamento date,
    ADD COLUMN IF NOT EXISTS categoria text;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transacoes'
          AND column_name = 'created_at'
    ) THEN
        UPDATE public.transacoes
        SET data_lancamento = COALESCE(
            data_lancamento,
            (to_jsonb(transacoes)->>'created_at')::timestamptz::date,
            CURRENT_DATE
        )
        WHERE data_lancamento IS NULL;
    ELSE
        UPDATE public.transacoes
        SET data_lancamento = CURRENT_DATE
        WHERE data_lancamento IS NULL;
    END IF;

    UPDATE public.transacoes
    SET categoria = 'Outros'
    WHERE categoria IS NULL;
END
$$;

ALTER TABLE public.transacoes
    ALTER COLUMN data_lancamento SET DEFAULT CURRENT_DATE,
    ALTER COLUMN data_lancamento SET NOT NULL,
    ALTER COLUMN categoria SET DEFAULT 'Outros',
    ALTER COLUMN categoria SET NOT NULL;

CREATE INDEX IF NOT EXISTS transacoes_data_lancamento_idx
    ON public.transacoes (data_lancamento DESC);
