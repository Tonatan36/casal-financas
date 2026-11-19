import os
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Credenciais SUPABASE_URL ou SUPABASE_KEY não encontradas no .env")

supabase: Client = create_client(url, key)


def executar_pipeline_analitico():
    print("🔄 Extraindo dados do Supabase...")

    res_transacoes = supabase.table("transacoes").select("*").execute()
    res_orcamentos = supabase.table("orcamentos_categoria").select("*").execute()

    df_trans = pd.DataFrame(res_transacoes.data)
    df_orc = pd.DataFrame(res_orcamentos.data)

    if df_trans.empty:
        print("⚠️ Nenhuma transação encontrada na base de dados.")
        return

    df_trans["valor"] = pd.to_numeric(df_trans["valor"], errors="coerce").fillna(0)
    df_trans["data"] = pd.to_datetime(df_trans["data"])
    df_trans["mes_ano"] = df_trans["data"].dt.to_period("M").astype(str)

    mes_atual = df_trans["mes_ano"].max()
    df_mes = df_trans[df_trans["mes_ano"] == mes_atual]

    receitas = df_mes[df_mes["tipo"] == "receita"]["valor"].sum()
    despesas = df_mes[df_mes["tipo"] == "despesa"]["valor"].sum()
    saldo = receitas - despesas
    taxa_poupanca = ((receitas - despesas) / receitas * 100) if receitas > 0 else 0

    print(f"\n📊 RESUMO EXECUTIVO ({mes_atual})")
    print("-" * 40)
    print(f"Total Receitas:   R$ {receitas:,.2f}")
    print(f"Total Despesas:   R$ {despesas:,.2f}")
    print(f"Saldo Líquido:    R$ {saldo:,.2f}")
    print(f"Taxa de Poupança: {taxa_poupanca:.1f}%")
    print("-" * 40)

    gastos_cat = (
        df_mes[df_mes["tipo"] == "despesa"]
        .groupby("categoria")["valor"]
        .sum()
        .reset_index()
        .rename(columns={"valor": "gasto_realizado"})
    )

    if not df_orc.empty and "mes_referencia" in df_orc.columns:
        df_orc["mes_ano"] = pd.to_datetime(df_orc["mes_referencia"]).dt.to_period("M").astype(str)
        orc_mes = df_orc[df_orc["mes_ano"] == mes_atual][["categoria", "limite"]]

        analise_desvio = pd.merge(gastos_cat, orc_mes, on="categoria", how="outer").fillna(0)
        analise_desvio["desvio_reais"] = analise_desvio["limite"] - analise_desvio["gasto_realizado"]
        analise_desvio["uso_percentual"] = analise_desvio.apply(
            lambda x: (x["gasto_realizado"] / x["limite"] * 100) if x["limite"] > 0 else 0,
            axis=1,
        )

        print("\n🎯 ORÇADO VS. REALIZADO POR CATEGORIA:")
        print(analise_desvio.to_string(index=False))

    os.makedirs("exports", exist_ok=True)
    caminho_csv = f"exports/base_analitica_{mes_atual}.csv"
    df_trans.to_csv(caminho_csv, index=False, sep=";", decimal=",")
    print(f"\n✅ Base normalizada exportada com sucesso para: {caminho_csv}")


if __name__ == "__main__":
    executar_pipeline_analitico()