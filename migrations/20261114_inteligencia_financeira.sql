ALTER TABLE public.transacoes
    ADD COLUMN IF NOT EXISTS percentual_ewerton numeric(5, 2)
        CHECK (percentual_ewerton BETWEEN 0 AND 100);

ALTER TABLE public.metas_compartilhadas
    ADD COLUMN IF NOT EXISTS data_limite date;

CREATE TABLE IF NOT EXISTS public.regras_rateio_categoria (
    categoria text PRIMARY KEY,
    regra text NOT NULL CHECK (regra IN ('igual', 'proporcional', 'individual_ewerton', 'individual_blenda')),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fundos_sazonais (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    valor_alvo numeric(12, 2) NOT NULL CHECK (valor_alvo > 0),
    valor_atual numeric(12, 2) NOT NULL DEFAULT 0 CHECK (valor_atual >= 0),
    data_alvo date NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fechamentos_mensais (
    mes_referencia date PRIMARY KEY CHECK (extract(day FROM mes_referencia) = 1),
    fechado_em timestamptz NOT NULL DEFAULT now(),
    resumo jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.configuracao_fluxo_caixa (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    saldo_base numeric(12, 2) NOT NULL DEFAULT 0,
    data_base date NOT NULL DEFAULT CURRENT_DATE,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.impedir_alteracao_mes_fechado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    mes date;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        mes := date_trunc('month', OLD.data_lancamento)::date;
        IF EXISTS (SELECT 1 FROM public.fechamentos_mensais WHERE mes_referencia = mes) THEN
            RAISE EXCEPTION 'O mês % está fechado; lançamentos históricos não podem ser alterados.', to_char(mes, 'YYYY-MM');
        END IF;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
    END IF;

    IF TG_OP <> 'DELETE' THEN
        mes := date_trunc('month', NEW.data_lancamento)::date;
        IF EXISTS (SELECT 1 FROM public.fechamentos_mensais WHERE mes_referencia = mes) THEN
            RAISE EXCEPTION 'O mês % está fechado; não é possível incluir ou mover lançamentos.', to_char(mes, 'YYYY-MM');
        END IF;
        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS transacoes_mes_fechado_guard ON public.transacoes;
CREATE TRIGGER transacoes_mes_fechado_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.transacoes
    FOR EACH ROW EXECUTE FUNCTION public.impedir_alteracao_mes_fechado();

CREATE OR REPLACE FUNCTION public.registrar_aporte_fundo(fundo_id uuid, valor_aporte numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF valor_aporte <= 0 THEN
        RAISE EXCEPTION 'O aporte deve ser maior que zero.';
    END IF;

    UPDATE public.fundos_sazonais
    SET valor_atual = valor_atual + valor_aporte
    WHERE id = fundo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fundo sazonal não encontrado.';
    END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.regras_rateio_categoria,
    public.fundos_sazonais,
    public.configuracao_fluxo_caixa
TO anon, authenticated;
REVOKE ALL ON public.fechamentos_mensais FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fechamentos_mensais TO anon, authenticated;
GRANT INSERT ON public.fechamentos_mensais TO anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.fechamentos_mensais FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_aporte_fundo(uuid, numeric) TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.metas_compartilhadas TO anon, authenticated;

DO $$
DECLARE
    tabela text;
BEGIN
    FOREACH tabela IN ARRAY ARRAY[
        'transacoes',
        'metas_compartilhadas',
        'regras_rateio_categoria',
        'fundos_sazonais',
        'fechamentos_mensais',
        'configuracao_fluxo_caixa'
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
