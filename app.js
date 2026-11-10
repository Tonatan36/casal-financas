// Configuração da Senha do Casal
const SENHA_MESTRE = "1234";

// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://kkrqrvticxtnexlxsghs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Dl9qdGpU7FS5hCzWI0P8Kw_l9MsBFYl';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let promptInstalacaoPWA = null;
let transacaoEmEdicao = null;
let sufixoParcelaEmEdicao = '';
let todasTransacoes = [];

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptInstalacaoPWA = event;
});

window.addEventListener('appinstalled', () => {
    promptInstalacaoPWA = null;
    document.querySelectorAll('[data-install-app]').forEach(button => {
        button.classList.add('hidden');
    });
});

window.addEventListener('online', () => mostrarMensagem('Conexão restabelecida.'));
window.addEventListener('offline', () => mostrarMensagem('Você está offline. Os lançamentos precisam de conexão para sincronizar.'));

function mostrarMensagem(texto, tipo = 'sucesso') {
    const mensagem = document.getElementById('mensagem-app');
    mensagem.textContent = texto;
    mensagem.className = `mb-4 rounded-xl px-4 py-3 text-sm ${tipo === 'erro' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`;
    mensagem.classList.remove('hidden');
}

function esconderMensagem() {
    document.getElementById('mensagem-app').classList.add('hidden');
}

function dataLocalISO(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

async function instalarAplicativo() {
    if (promptInstalacaoPWA) {
        const evento = promptInstalacaoPWA;
        promptInstalacaoPWA = null;

        try {
            await evento.prompt();
            await evento.userChoice;
        } catch (error) {
            console.error('Erro ao iniciar instalação do PWA:', error);
            mostrarMensagem('Não foi possível iniciar a instalação. Tente pelo menu do navegador.', 'erro');
        }
        return;
    }

    const navegadorStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    if (navegadorStandalone) {
        mostrarMensagem('O aplicativo já está instalado neste dispositivo.');
        return;
    }

    const agente = window.navigator.userAgent;
    const dispositivoApple = /iPhone|iPad|iPod/.test(agente)
        || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    if (dispositivoApple) {
        mostrarMensagem('Para instalar no iPhone ou iPad: toque em Compartilhar no Safari e escolha "Adicionar à Tela de Início".');
    } else if (/Android/i.test(agente)) {
        mostrarMensagem('Para instalar, abra o menu do navegador e toque em "Instalar app" ou "Adicionar à tela inicial".');
    } else {
        mostrarMensagem('Para instalar, abra o menu do navegador e escolha "Instalar app".');
    }
}

function verificarSenha() {
    const senhaDigitada = document.getElementById('input-senha').value;
    if (senhaDigitada === SENHA_MESTRE) {
        document.getElementById('modal-senha').classList.add('hidden');
        document.getElementById('app-conteudo').classList.remove('hidden');
        document.getElementById('mes-filtro').value = dataLocalISO().slice(0, 7);
        carregarTransacoes();
    } else {
        document.getElementById('erro-senha').classList.remove('hidden');
        document.getElementById('input-senha').value = '';
    }
}

function bloquearApp() {
    document.getElementById('input-senha').value = '';
    document.getElementById('erro-senha').classList.add('hidden');
    document.getElementById('app-conteudo').classList.add('hidden');
    document.getElementById('modal-senha').classList.remove('hidden');
}

function alternarCamposTipo() {
    const tipo = document.getElementById('tipo').value;
    document.getElementById('bloco-despesa-extras').classList.toggle('hidden', tipo === 'receita');
    document.getElementById('bloco-recorrente').classList.toggle('hidden', tipo === 'receita');
}

function alternarFormaPagamento() {
    const forma = document.getElementById('forma-pagamento').value;
    document.getElementById('conta-origem').classList.toggle('hidden', forma !== 'a_vista');
    document.getElementById('bloco-parcelado').classList.toggle('hidden', forma === 'a_vista');
    document.getElementById('bloco-recorrente').classList.toggle('hidden',
        document.getElementById('tipo').value === 'receita' || forma !== 'a_vista');
    document.getElementById('parcelas').disabled = forma === 'a_vista';
    document.getElementById('cartao').disabled = forma === 'a_vista';
}

function adicionarMeses(data, quantidade) {
    const [ano, mes, dia] = data.split('-').map(Number);
    const mesAlvo = mes - 1 + quantidade;
    const ultimoDia = new Date(ano, mesAlvo + 1, 0).getDate();
    const dataAlvo = new Date(ano, mesAlvo, Math.min(dia, ultimoDia));
    return `${dataAlvo.getFullYear()}-${String(dataAlvo.getMonth() + 1).padStart(2, '0')}-${String(dataAlvo.getDate()).padStart(2, '0')}`;
}

function dadosDoFormulario(data, indiceParcela = null, valorJaEhParcela = false) {
    const tipo = document.getElementById('tipo').value;
    const valorInformado = Math.round(Number(document.getElementById('valor').value) * 100);
    const parcelas = tipo === 'despesa' && document.getElementById('forma-pagamento').value === 'parcelado'
        ? Number(document.getElementById('parcelas').value)
        : 1;
    const valorCentavos = parcelas > 1 && !valorJaEhParcela
        ? Math.floor(valorInformado / parcelas) + (indiceParcela !== null && indiceParcela < valorInformado % parcelas ? 1 : 0)
        : valorInformado;
    const descricaoBase = document.getElementById('descricao').value.trim();
    const parcelaDescricao = indiceParcela !== null && parcelas > 1
        ? ` (${indiceParcela + 1}/${parcelas})`
        : (valorJaEhParcela ? sufixoParcelaEmEdicao : '');
    const recorrente = tipo === 'despesa'
        && document.getElementById('recorrente').checked
        && document.getElementById('forma-pagamento').value === 'a_vista';
    const formaPagamento = tipo === 'despesa' ? document.getElementById('forma-pagamento').value : null;

    return {
        descricao: descricaoBase + parcelaDescricao,
        valor: valorCentavos / 100,
        tipo,
        responsavel: document.getElementById('responsavel').value,
        forma_pagamento: formaPagamento,
        conta_origem: formaPagamento === 'a_vista' ? document.getElementById('conta-origem').value : null,
        cartao: formaPagamento === 'parcelado' ? (document.getElementById('cartao').value.trim() || 'Outro cartão') : null,
        parcelas: parcelas > 1 ? parcelas : null,
        recorrente,
        data_lancamento: data,
        categoria: tipo === 'receita' ? 'Receitas' : document.getElementById('categoria').value
    };
}

async function adicionarTransacao(event) {
    event.preventDefault();
    esconderMensagem();

    const valor = Number(document.getElementById('valor').value);
    const tipo = document.getElementById('tipo').value;
    const pagamentoParcelado = tipo === 'despesa' && document.getElementById('forma-pagamento').value === 'parcelado';
    const parcelas = Number(document.getElementById('parcelas').value);
    if (!Number.isFinite(valor) || valor <= 0) {
        mostrarMensagem('Informe um valor maior que zero.', 'erro');
        return;
    }
    if (pagamentoParcelado && (!Number.isInteger(parcelas) || parcelas < 2 || parcelas > 120)) {
        mostrarMensagem('Informe uma quantidade de parcelas entre 2 e 120.', 'erro');
        return;
    }
    if (pagamentoParcelado && document.getElementById('recorrente').checked && !transacaoEmEdicao) {
        mostrarMensagem('Uma despesa não pode ser parcelada e recorrente ao mesmo tempo.', 'erro');
        return;
    }

    const dataBase = document.getElementById('data-lancamento').value;
    const botao = document.getElementById('botao-salvar');
    botao.disabled = true;
    botao.textContent = 'Salvando...';
    try {
        if (transacaoEmEdicao !== null) {
            const payload = dadosDoFormulario(dataBase, null, true);
            const { error } = await supabaseClient.from('transacoes').update(payload).eq('id', transacaoEmEdicao);
            if (error) throw error;
            mostrarMensagem('Lançamento atualizado.');
        } else {
            const quantidade = document.getElementById('recorrente').checked && tipo === 'despesa' ? 12 : (pagamentoParcelado ? parcelas : 1);
            const payload = Array.from({ length: quantidade }, (_, indice) => {
                const data = adicionarMeses(dataBase, indice);
                return dadosDoFormulario(data, pagamentoParcelado ? indice : null);
            });
            const { error } = await supabaseClient.from('transacoes').insert(payload);
            if (error) throw error;
            mostrarMensagem(quantidade > 1
                ? `${quantidade} lançamentos mensais adicionados.`
                : 'Lançamento salvo.');
        }
        limparFormulario();
        await carregarTransacoes();
    } catch (error) {
        console.error('Erro ao salvar transação:', error);
        mostrarMensagem(`Não foi possível salvar. ${error?.message || 'Verifique sua conexão e a migração do banco.'}`, 'erro');
    } finally {
        botao.disabled = false;
        botao.textContent = transacaoEmEdicao === null ? 'Salvar Transação' : 'Salvar Alterações';
    }
}

function limparFormulario() {
    transacaoEmEdicao = null;
    sufixoParcelaEmEdicao = '';
    document.getElementById('form-transacao').reset();
    document.getElementById('data-lancamento').value = dataLocalISO();
    document.getElementById('botao-cancelar-edicao').classList.add('hidden');
    document.getElementById('botao-salvar').textContent = 'Salvar Transação';
    alternarCamposTipo();
    alternarFormaPagamento();
}

function editarTransacao(id) {
    const transacao = todasTransacoes.find(item => String(item.id) === String(id));
    if (!transacao) return;

    transacaoEmEdicao = transacao.id;
    const parcela = transacao.descricao.match(/ (\(\d+\/\d+\))$/);
    sufixoParcelaEmEdicao = parcela ? parcela[1] : '';
    document.getElementById('descricao').value = transacao.descricao.replace(/ \(\d+\/\d+\)$/, '');
    document.getElementById('valor').value = Number(transacao.valor).toFixed(2);
    document.getElementById('tipo').value = transacao.tipo;
    document.getElementById('responsavel').value = transacao.responsavel;
    document.getElementById('data-lancamento').value = transacao.data_lancamento || dataLocalISO();
    document.getElementById('categoria').value = transacao.categoria || 'Outros';
    document.getElementById('recorrente').checked = Boolean(transacao.recorrente);
    if (transacao.tipo === 'despesa') {
        document.getElementById('forma-pagamento').value = transacao.forma_pagamento || 'a_vista';
        document.getElementById('conta-origem').value = transacao.conta_origem || 'Nubank';
        document.getElementById('cartao').value = transacao.cartao || '';
        document.getElementById('parcelas').value = transacao.parcelas || 2;
    }
    alternarCamposTipo();
    alternarFormaPagamento();
    document.getElementById('botao-salvar').textContent = 'Salvar Alterações';
    document.getElementById('botao-cancelar-edicao').classList.remove('hidden');
    document.getElementById('form-transacao').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function obterTransacoesFiltradas() {
    const mes = document.getElementById('mes-filtro').value;
    const tipo = document.getElementById('tipo-filtro').value;
    const responsavel = document.getElementById('responsavel-filtro').value;
    const categoria = document.getElementById('categoria-filtro').value;

    return todasTransacoes.filter(transacao =>
        (!mes || (transacao.data_lancamento || '').startsWith(mes))
        && (!tipo || transacao.tipo === tipo)
        && (!responsavel || transacao.responsavel === responsavel)
        && (!categoria || transacao.categoria === categoria)
    );
}

function adicionarCelula(linha, conteudo, classes = '') {
    const celula = document.createElement('td');
    celula.className = classes;
    celula.textContent = conteudo;
    linha.appendChild(celula);
    return celula;
}

function renderizarTransacoes() {
    const transacoes = obterTransacoesFiltradas();
    const mes = document.getElementById('mes-filtro').value;
    const resumoTransacoes = todasTransacoes.filter(transacao =>
        !mes || (transacao.data_lancamento || '').startsWith(mes));
    const tbody = document.getElementById('tabela-transacoes');
    tbody.replaceChildren();
    const totalReceitas = resumoTransacoes
        .filter(transacao => transacao.tipo === 'receita')
        .reduce((total, transacao) => total + Number(transacao.valor), 0);
    const totalDespesas = resumoTransacoes
        .filter(transacao => transacao.tipo === 'despesa')
        .reduce((total, transacao) => total + Number(transacao.valor), 0);

    transacoes.forEach(transacao => {
        const receita = transacao.tipo === 'receita';
        const valor = Number(transacao.valor);

        let pagamento = '-';
        if (receita) pagamento = 'Receita / Entrada';
        else if (transacao.forma_pagamento === 'a_vista') pagamento = `À vista (${transacao.conta_origem || 'Conta'})`;
        else pagamento = `Parcelado (${transacao.parcelas || 1}x no ${transacao.cartao || 'Cartão'})`;
        if (transacao.recorrente) pagamento += ' 🔁';

        const linha = document.createElement('tr');
        linha.className = 'border-b hover:bg-slate-50 transition';
        adicionarCelula(linha, transacao.descricao, 'py-3 font-medium text-slate-700');
        const responsavel = adicionarCelula(linha, transacao.responsavel, 'py-3 text-slate-500');
        responsavel.dataset.label = 'Responsável';
        const categoria = adicionarCelula(linha, transacao.categoria || 'Outros', 'py-3 text-slate-500');
        categoria.dataset.label = 'Categoria';
        const pagamentoCelula = adicionarCelula(linha, pagamento, 'py-3 text-slate-500 text-xs');
        pagamentoCelula.dataset.label = 'Pagamento';
        const tipoCelula = adicionarCelula(linha, '', 'py-3');
        const tipoTag = document.createElement('span');
        tipoTag.className = `${receita ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'} px-2.5 py-1 rounded-full text-xs font-semibold`;
        tipoTag.textContent = receita ? 'RECEITA' : 'DESPESA';
        tipoCelula.appendChild(tipoTag);
        adicionarCelula(linha, `${receita ? '+' : '-'} ${moeda.format(valor)}`, `py-3 text-right font-bold ${receita ? 'text-emerald-600' : 'text-rose-600'}`);
        const acoes = adicionarCelula(linha, '', 'py-3 text-center whitespace-nowrap');
        const editar = document.createElement('button');
        editar.type = 'button';
        editar.textContent = 'Editar';
        editar.className = 'text-indigo-600 hover:text-indigo-800 text-xs font-semibold mr-3';
        editar.addEventListener('click', () => editarTransacao(transacao.id));
        acoes.appendChild(editar);
        const excluir = document.createElement('button');
        excluir.type = 'button';
        excluir.textContent = 'Excluir';
        excluir.className = 'text-slate-400 hover:text-rose-600 text-xs font-bold';
        excluir.addEventListener('click', () => excluirTransacao(transacao.id));
        acoes.appendChild(excluir);
        tbody.appendChild(linha);
    });
    if (transacoes.length === 0) {
        const linha = document.createElement('tr');
        const celula = adicionarCelula(linha, 'Nenhum lançamento encontrado para estes filtros.', 'py-6 text-center text-slate-400');
        celula.colSpan = 7;
        tbody.appendChild(linha);
    }

    const saldo = totalReceitas - totalDespesas;
    const porcentagem = totalReceitas > 0 ? totalDespesas / totalReceitas * 100 : (totalDespesas > 0 ? 100 : 0);
    const barra = document.getElementById('barra-progresso');
    document.getElementById('total-receitas').textContent = moeda.format(totalReceitas);
    document.getElementById('total-despesas').textContent = moeda.format(totalDespesas);
    document.getElementById('porcentagem-gastos').textContent = `${porcentagem.toFixed(1)}%`;
    barra.style.width = `${Math.min(porcentagem, 100)}%`;
    barra.className = `${porcentagem > 100 ? 'bg-red-700' : (porcentagem > 80 ? 'bg-amber-500' : 'bg-rose-500')} h-full transition-all duration-500`;
    const saldoElemento = document.getElementById('saldo-total');
    saldoElemento.textContent = moeda.format(saldo);
    saldoElemento.className = `text-2xl font-bold ${saldo >= 0 ? 'text-indigo-600' : 'text-rose-600'}`;

    atualizarMeta(saldo);
    document.getElementById('resultado-filtro').textContent = `${transacoes.length} lançamento(s) no período`;
}

async function carregarTransacoes() {
    const tbody = document.getElementById('tabela-transacoes');
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">Carregando lançamentos...</td></tr>';
    const { data: transacoes, error } = await supabaseClient
        .from('transacoes')
        .select('*')
        .order('data_lancamento', { ascending: false })
        .order('id', { ascending: false });

    if (error) {
        console.error('Erro ao carregar transações:', error);
        tbody.replaceChildren();
        mostrarMensagem(`Não foi possível carregar os lançamentos. ${error.message}`, 'erro');
        return;
    }
    todasTransacoes = transacoes || [];
    renderizarTransacoes();
}

async function excluirTransacao(id) {
    if (!confirm('Deseja realmente apagar este lançamento?')) return;
    const { error } = await supabaseClient.from('transacoes').delete().eq('id', id);
    if (error) {
        console.error('Erro ao excluir:', error);
        mostrarMensagem(`Não foi possível excluir. ${error.message}`, 'erro');
        return;
    }
    mostrarMensagem('Lançamento excluído.');
    await carregarTransacoes();
}

function atualizarMeta(saldo) {
    const meta = Number(localStorage.getItem('meta-mensal-casal') || 0);
    document.getElementById('valor-meta').textContent = meta > 0 ? moeda.format(meta) : 'Não definida';
    const progresso = meta > 0 ? Math.max(0, Math.min(saldo / meta * 100, 100)) : 0;
    document.getElementById('progresso-meta').style.width = `${progresso}%`;
    document.getElementById('texto-progresso-meta').textContent = meta > 0
        ? `${progresso.toFixed(0)}% da meta de saldo`
        : 'Defina uma meta mensal de saldo positivo.';
}

function salvarMeta() {
    const valor = Number(document.getElementById('meta-input').value);
    if (!Number.isFinite(valor) || valor < 0) {
        mostrarMensagem('Informe uma meta válida.', 'erro');
        return;
    }
    localStorage.setItem('meta-mensal-casal', String(valor));
    renderizarTransacoes();
    mostrarMensagem('Meta mensal salva neste dispositivo.');
}

function exportarCSV() {
    const transacoes = obterTransacoesFiltradas();
    const escapar = valor => {
        const texto = String(valor ?? '');
        const seguro = /^[\s]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
        return `"${seguro.replaceAll('"', '""')}"`;
    };
    const linhas = [
        ['Data', 'Descrição', 'Categoria', 'Responsável', 'Tipo', 'Forma de pagamento', 'Cartão/Conta', 'Valor'],
        ...transacoes.map(transacao => [
            transacao.data_lancamento,
            transacao.descricao,
            transacao.categoria,
            transacao.responsavel,
            transacao.tipo,
            transacao.forma_pagamento,
            transacao.cartao || transacao.conta_origem,
            Number(transacao.valor).toFixed(2).replace('.', ',')
        ])
    ];
    const conteudo = '\uFEFF' + linhas.map(linha => linha.map(escapar).join(';')).join('\r\n');
    const arquivo = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(arquivo);
    link.download = `financas-${document.getElementById('mes-filtro').value || 'todos'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('data-lancamento').value = dataLocalISO();
    document.getElementById('mes-filtro').value = dataLocalISO().slice(0, 7);
    if (!navigator.onLine) mostrarMensagem('Você está offline. Os lançamentos precisam de conexão para sincronizar.', 'erro');
    document.getElementById('mes-filtro').addEventListener('change', renderizarTransacoes);
    ['tipo-filtro', 'responsavel-filtro', 'categoria-filtro'].forEach(id =>
        document.getElementById(id).addEventListener('change', renderizarTransacoes));
    document.getElementById('botao-cancelar-edicao').addEventListener('click', limparFormulario);
    document.getElementById('botao-meta').addEventListener('click', salvarMeta);
    document.getElementById('botao-exportar').addEventListener('click', exportarCSV);
});
