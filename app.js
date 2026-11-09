// Configuração da Senha do Casal
const SENHA_MESTRE = "1234";

// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://kkrqrvticxtnexlxsghs.supabase.co/rest/v1/'; // Substitui pela tua URL do Supabase
const SUPABASE_ANON_KEY = 'sb_publishable_Dl9qdGpU7FS5hCzWI0P8Kw_l9MsBFYl'; // Substitui pela tua Anon Key

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Verificação de Senha
function verificarSenha() {
    const senhaDigitada = document.getElementById('input-senha').value;
    if (senhaDigitada === SENHA_MESTRE) {
        document.getElementById('modal-senha').classList.add('hidden');
        document.getElementById('app-conteudo').classList.remove('hidden');
        carregarTransacoes();
    } else {
        const erro = document.getElementById('erro-senha');
        erro.classList.remove('hidden');
        document.getElementById('input-senha').value = '';
    }
}

function bloquearApp() {
    document.getElementById('input-senha').value = '';
    document.getElementById('erro-senha').classList.add('hidden');
    document.getElementById('app-conteudo').classList.add('hidden');
    document.getElementById('modal-senha').classList.remove('hidden');
}

// Controlar campos visíveis no formulário consoante o tipo e forma de pagamento
function alternarCamposTipo() {
    const tipo = document.getElementById('tipo').value;
    const blocoExtras = document.getElementById('bloco-despesa-extras');
    if (tipo === 'receita') {
        blocoExtras.classList.add('hidden');
    } else {
        blocoExtras.classList.remove('hidden');
    }
}

function alternarFormaPagamento() {
    const forma = document.getElementById('forma-pagamento').value;
    const contaOrigem = document.getElementById('conta-origem');
    const blocoParcelado = document.getElementById('bloco-parcelado');

    if (forma === 'a_vista') {
        contaOrigem.classList.remove('hidden');
        blocoParcelado.classList.add('hidden');
    } else {
        contaOrigem.classList.add('hidden');
        blocoParcelado.classList.remove('hidden');
    }
}

// Adicionar Transação
async function adicionarTransacao(event) {
    event.preventDefault();
    
    const descricao = document.getElementById('descricao').value;
    const valor = parseFloat(document.getElementById('valor').value);
    const tipo = document.getElementById('tipo').value;
    const responsavel = document.getElementById('responsavel').value;
    const recorrente = document.getElementById('recorrente').checked;

    let forma_pagamento = null;
    let conta_origem = null;
    let cartao = null;
    let parcelas = null;

    if (tipo === 'despesa') {
        forma_pagamento = document.getElementById('forma-pagamento').value;
        if (forma_pagamento === 'a_vista') {
            conta_origem = document.getElementById('conta-origem').value;
        } else {
            cartao = document.getElementById('cartao').value || 'Cartão de Crédito';
            parcelas = parseInt(document.getElementById('parcelas').value) || 1;
        }
    }

    const payload = {
        descricao,
        valor,
        tipo,
        responsavel,
        forma_pagamento,
        conta_origem,
        cartao,
        parcelas,
        recorrente
    };

    const { error } = await supabaseClient
        .from('transacoes')
        .insert([payload]);

    if (error) {
        console.error('Erro ao adicionar transação:', error);
        alert('Erro ao guardar transação.');
        return;
    }

    document.getElementById('form-transacao').reset();
    alternarCamposTipo();
    alternarFormaPagamento();
    carregarTransacoes();
}

// Carregar Transações e Atualizar Resumo com Porcentagem
async function carregarTransacoes() {
    const { data: transacoes, error } = await supabaseClient
        .from('transacoes')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('Erro ao carregar transações:', error);
        return;
    }

    const tbody = document.getElementById('tabela-transacoes');
    tbody.innerHTML = '';

    let totalReceitas = 0;
    let totalDespesas = 0;

    transacoes.forEach(t => {
        if (t.tipo === 'receita') totalReceitas += Number(t.valor);
        else totalDespesas += Number(t.valor);

        // Montar texto descritivo do pagamento
        let detalhesPagamento = '-';
        if (t.tipo === 'despesa') {
            if (t.forma_pagamento === 'a_vista') {
                detalhesPagamento = `À vista (${t.conta_origem || 'Conta'})`;
            } else {
                detalhesPagamento = `Parcelado (${t.parcelas}x no ${t.cartao})`;
            }
        } else {
            detalhesPagamento = 'Receita / Entrada';
        }

        if (t.recorrente) {
            detalhesPagamento += ' 🔁';
        }

        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-slate-50 transition';
        tr.innerHTML = `
            <td class="py-3 font-medium text-slate-700">${t.descricao}</td>
            <td data-label="Responsável" class="py-3 text-slate-500"><span class="bg-slate-100 px-2 py-1 rounded-md text-xs font-medium">${t.responsavel}</span></td>
            <td data-label="Pagamento" class="py-3 text-slate-500 text-xs">${detalhesPagamento}</td>
            <td class="py-3"><span class="${t.tipo === 'receita' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'} px-2.5 py-1 rounded-full text-xs font-semibold">${t.tipo.toUpperCase()}</span></td>
            <td class="py-3 text-right font-bold ${t.tipo === 'receita' ? 'text-emerald-600' : 'text-rose-600'}">${t.tipo === 'receita' ? '+' : '-'} R$ ${Number(t.valor).toFixed(2)}</td>
            <td class="py-3 text-center">
                <button onclick="excluirTransacao(${t.id})" class="text-slate-400 hover:text-rose-600 transition text-xs font-bold">✕</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const saldo = totalReceitas - totalDespesas;

    // --- CÁLCULO DA PORCENTAGEM DE GASTOS EM RELAÇÃO ÀS RECEITAS ---
    let porcentagem = 0;
    if (totalReceitas > 0) {
        porcentagem = (totalDespesas / totalReceitas) * 100;
    } else if (totalDespesas > 0) {
        porcentagem = 100;
    }

    let larguraBarra = porcentagem > 100 ? 100 : porcentagem;

    // Atualizar UI dos Cards e Barra de Progresso
    document.getElementById('total-receitas').innerText = `R$ ${totalReceitas.toFixed(2)}`;
    document.getElementById('total-despesas').innerText = `R$ ${totalDespesas.toFixed(2)}`;
    
    const elPorcentagem = document.getElementById('porcentagem-gastos');
    const elBarra = document.getElementById('barra-progresso');

    if (elPorcentagem) elPorcentagem.innerText = `${porcentagem.toFixed(1)}%`;
    if (elBarra) {
        elBarra.style.width = `${larguraBarra}%`;
        if (porcentagem > 100) {
            elBarra.className = 'bg-red-700 h-full transition-all duration-500';
        } else if (porcentagem > 80) {
            elBarra.className = 'bg-amber-500 h-full transition-all duration-500';
        } else {
            elBarra.className = 'bg-rose-500 h-full transition-all duration-500';
        }
    }

    const elSaldo = document.getElementById('saldo-total');
    elSaldo.innerText = `R$ ${saldo.toFixed(2)}`;
    elSaldo.className = `text-2xl font-bold ${saldo >= 0 ? 'text-indigo-600' : 'text-rose-600'}`;
}

// Excluir Transação
async function excluirTransacao(id) {
    if (confirm('Deseja realmente apagar este lançamento?')) {
        const { error } = await supabaseClient
            .from('transacoes')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Erro ao excluir:', error);
        } else {
            carregarTransacoes();
        }
    }
}