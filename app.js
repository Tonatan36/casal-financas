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
let cartoes = [];
let contasAgendadas = [];
let metasCompartilhadas = [];
let dividas = [];
let faturasMarcadas = [];
let recorrencias = [];
let orcamentosCategoria = [];
let canalTempoReal = null;

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

async function verificarSenha() {
    const senhaDigitada = document.getElementById('input-senha').value;
    if (senhaDigitada === SENHA_MESTRE) {
        document.getElementById('modal-senha').classList.add('hidden');
        document.getElementById('app-conteudo').classList.remove('hidden');
        document.getElementById('mes-filtro').value = dataLocalISO().slice(0, 7);
        try {
            await gerarLancamentosDoMes(dataLocalISO().slice(0, 7));
        } catch (error) {
            console.error('Erro ao gerar recorrências do mês:', error);
            mostrarMensagem(`Não foi possível gerar recorrências. ${error.message}`, 'erro');
        }
        await carregarTransacoes();
        await carregarDadosCompartilhados();
        observarAtualizacoes();
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
    if (tipo === 'receita') document.getElementById('forma-pagamento').value = 'a_vista';
}

function alternarFormaPagamento() {
    const forma = document.getElementById('forma-pagamento').value;
    document.getElementById('conta-origem').classList.toggle('hidden', forma !== 'a_vista');
    document.getElementById('bloco-parcelado').classList.toggle('hidden', forma === 'a_vista');
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
    const formaPagamento = tipo === 'despesa' ? document.getElementById('forma-pagamento').value : null;

    const cartaoDigitado = formaPagamento === 'parcelado' ? (document.getElementById('cartao').value.trim() || 'Outro cartão') : null;
    const cartaoCadastrado = cartoes.find(item => item.nome.toLowerCase() === (cartaoDigitado || '').toLowerCase());
    const nomeCartao = cartaoCadastrado?.nome || cartaoDigitado;
    return {
        descricao: descricaoBase + parcelaDescricao,
        valor: valorCentavos / 100,
        tipo,
        responsavel: document.getElementById('responsavel').value,
        forma_pagamento: formaPagamento,
        conta_origem: formaPagamento === 'a_vista' ? document.getElementById('conta-origem').value : null,
        cartao: nomeCartao,
        fatura_mes: formaPagamento === 'parcelado' ? calcularMesFatura(data, cartaoCadastrado) : null,
        parcelas: parcelas > 1 ? parcelas : null,
        recorrente: false,
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
            const quantidade = pagamentoParcelado ? parcelas : 1;
            const payload = Array.from({ length: quantidade }, (_, indice) => {
                const data = adicionarMeses(dataBase, indice);
                return { ...dadosDoFormulario(data, pagamentoParcelado ? indice : null), status_pagamento: 'pago' };
            });
            const { error } = await supabaseClient.from('transacoes').insert(payload);
            if (error) throw error;
            mostrarMensagem(quantidade > 1 ? `${quantidade} parcelas adicionadas.` : 'Lançamento salvo.');
        }
        limparFormulario();
        await carregarTransacoes();
        await carregarDadosCompartilhados();
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
        if (transacao.recorrencia_id) {
            const origem = recorrencias.find(item => item.id === transacao.recorrencia_id);
            pagamento += ` · Série: ${origem?.descricao || 'recorrência mensal'} · ${transacao.status_pagamento || 'pendente'}`;
        }

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
        if (transacao.recorrencia_id) {
            const status = document.createElement('button');
            status.type = 'button';
            status.textContent = transacao.status_pagamento === 'pago'
                ? 'Pendente'
                : (receita ? 'Recebido' : 'Pago');
            status.className = 'text-emerald-700 hover:text-emerald-900 text-xs font-semibold mr-3';
            status.addEventListener('click', () => alternarStatusRecorrencia(transacao));
            acoes.appendChild(status);
        }
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
    renderizarOrcamentos();
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
    renderizarCartoes();
    atualizarDashboard();
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

async function alternarStatusRecorrencia(transacao) {
    const status = transacao.status_pagamento === 'pago' ? 'pendente' : 'pago';
    const { error } = await supabaseClient.from('transacoes').update({ status_pagamento: status }).eq('id', transacao.id);
    if (error) {
        console.error('Erro ao atualizar status da recorrência:', error);
        mostrarMensagem(`Não foi possível atualizar o status. ${error.message}`, 'erro');
        return;
    }
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

function dataMes(ano, mes, dia) {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

function calcularMesFatura(dataCompra, cartao) {
    if (!cartao) return dataCompra.slice(0, 7);
    const [ano, mes, dia] = dataCompra.split('-').map(Number);
    let anoFechamento = ano;
    let mesFechamento = mes;
    if (dia > Number(cartao.dia_fechamento)) {
        mesFechamento += 1;
        if (mesFechamento > 12) { mesFechamento = 1; anoFechamento += 1; }
    }
    let anoVencimento = anoFechamento;
    let mesVencimento = mesFechamento;
    if (Number(cartao.dia_vencimento) <= Number(cartao.dia_fechamento)) {
        mesVencimento += 1;
        if (mesVencimento > 12) { mesVencimento = 1; anoVencimento += 1; }
    }
    return `${anoVencimento}-${String(mesVencimento).padStart(2, '0')}`;
}

function mesAnterior(mes) {
    const [ano, numero] = mes.split('-').map(Number);
    const data = new Date(ano, numero - 2, 1);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function desenharBarras(id, grupos, cores = ['#4f46e5', '#10b981']) {
    const canvas = document.getElementById(id);
    const largura = canvas.clientWidth || 320;
    const altura = 190;
    const escala = window.devicePixelRatio || 1;
    canvas.width = largura * escala;
    canvas.height = altura * escala;
    canvas.style.height = `${altura}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(escala, escala);
    ctx.clearRect(0, 0, largura, altura);
    const valores = grupos.flatMap(grupo => grupo.valores);
    const maximo = Math.max(...valores.map(valor => Math.abs(valor)), 1);
    const margemEsquerda = 12;
    const margemInferior = 40;
    const graficoAltura = altura - margemInferior - 8;
    const temNegativos = valores.some(valor => valor < 0);
    const base = temNegativos ? graficoAltura / 2 + 8 : graficoAltura + 8;
    const escalaAltura = temNegativos ? graficoAltura / 2 : graficoAltura;
    const colunas = Math.max(...grupos.map(grupo => grupo.valores.length), 1);
    const espaco = (largura - margemEsquerda - 8) / colunas;
    grupos.forEach((grupo, grupoIndice) => {
        grupo.valores.forEach((valor, valorIndice) => {
            const x = margemEsquerda + valorIndice * espaco + espaco * 0.14;
            const barraLargura = Math.max(4, espaco * (grupos.length > 1 ? 0.34 : 0.66));
            const deslocamento = grupoIndice * barraLargura;
            const h = Math.max(2, Math.abs(valor) / maximo * escalaAltura);
            ctx.fillStyle = cores[grupoIndice % cores.length];
            ctx.fillRect(x + deslocamento, valor < 0 ? base : base - h, barraLargura - 2, h);
            if (grupoIndice === 0) {
                ctx.fillStyle = '#64748b';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                const rotulo = grupo.rotulos?.[valorIndice] || '';
                ctx.fillText(rotulo.slice(0, 13), x + espaco / 2, altura - 8);
            }
        });
    });
    if (grupos.length > 1) {
        grupos.forEach((grupo, i) => {
            ctx.fillStyle = cores[i % cores.length];
            ctx.fillRect(largura - 118 + (i % 2) * 62, 4, 8, 8);
            ctx.fillStyle = '#64748b';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(grupo.nome.slice(0, 10), largura - 106 + (i % 2) * 62, 12);
        });
    }
}

function atualizarDashboard() {
    const mes = document.getElementById('mes-filtro').value || dataLocalISO().slice(0, 7);
    const anterior = mesAnterior(mes);
    const transacoesMes = todasTransacoes.filter(item => (item.data_lancamento || '').startsWith(mes));
    const transacoesAnterior = todasTransacoes.filter(item => (item.data_lancamento || '').startsWith(anterior));
    const despesas = transacoesMes.filter(item => item.tipo === 'despesa');
    const categoriaTotais = lista => lista.reduce((totais, item) => {
        const categoria = item.categoria || 'Outros';
        totais[categoria] = (totais[categoria] || 0) + Number(item.valor);
        return totais;
    }, {});
    const atualPorCategoria = categoriaTotais(despesas);
    const anteriorPorCategoria = categoriaTotais(transacoesAnterior.filter(item => item.tipo === 'despesa'));
    const categorias = [...new Set([...Object.keys(atualPorCategoria), ...Object.keys(anteriorPorCategoria)])];
    desenharBarras('grafico-categorias', [
        { nome: 'Este mês', rotulos: categorias, valores: categorias.map(cat => atualPorCategoria[cat] || 0) },
        { nome: 'Mês anterior', valores: categorias.map(cat => anteriorPorCategoria[cat] || 0) }
    ]);
    document.getElementById('comparativo-categorias').textContent = `(${anterior}: mês atual x anterior)`;
    const pessoas = ['Ewerton', 'Blenda', 'Casal'];
    desenharBarras('grafico-receitas', [{ rotulos: pessoas, valores: pessoas.map(pessoa =>
        transacoesMes.filter(item => item.tipo === 'receita' && item.responsavel === pessoa).reduce((soma, item) => soma + Number(item.valor), 0)) }]);
    const saldoMeses = [];
    for (let deslocamento = 5; deslocamento >= 0; deslocamento--) {
        const [ano, numero] = mes.split('-').map(Number);
        const data = new Date(ano, numero - 1 - deslocamento, 1);
        const referencia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        const linhas = todasTransacoes.filter(item => (item.data_lancamento || '').startsWith(referencia));
        saldoMeses.push({
            rotulo: referencia.slice(5),
            valor: linhas.reduce((soma, item) => soma + (item.tipo === 'receita' ? 1 : -1) * Number(item.valor), 0)
        });
    }
    desenharBarras('grafico-saldo', [{ rotulos: saldoMeses.map(item => item.rotulo), valores: saldoMeses.map(item => item.valor) }]);
    const planejamento = window.planejamentoMes || {};
    const gastosPlanejados = Number(planejamento.despesas_previstas || 0);
    const gastosRealizados = despesas.reduce((soma, item) => soma + Number(item.valor), 0);
    desenharBarras('grafico-planejado', [{ rotulos: ['Despesas'], valores: [gastosPlanejados] }, { nome: 'Realizado', valores: [gastosRealizados] }]);
    const fixasDoMes = contasFixasNoMes(mes);
    const fixas = fixasDoMes.reduce((soma, item) => soma + Number(item.valor), 0);
    document.getElementById('indicador-fixas').textContent = moeda.format(fixas);
    document.getElementById('indicador-variaveis').textContent = moeda.format(Math.max(0, despesas.reduce((soma, item) => soma + Number(item.valor), 0) - fixas));
    document.getElementById('indicador-dividas').textContent = moeda.format(dividas.reduce((soma, item) => soma + Number(item.saldo_devedor), 0));
    const faturasFuturas = todasTransacoes.filter(item => item.tipo === 'despesa' && item.fatura_mes && item.fatura_mes > mes
        && !faturasMarcadas.some(fatura => fatura.cartao_id === cartoes.find(cartao => cartao.nome === item.cartao)?.id
            && fatura.mes_referencia === `${item.fatura_mes}-01` && fatura.status === 'paga'))
        .reduce((soma, item) => soma + Number(item.valor), 0);
    document.getElementById('indicador-faturas').textContent = moeda.format(faturasFuturas);
    const renda = Number(planejamento.renda_ewerton || 0) + Number(planejamento.renda_blenda || 0);
    document.getElementById('renda-familiar').textContent = moeda.format(renda);
    document.getElementById('saldo-planejado').textContent = moeda.format(renda - gastosPlanejados);
    const mesSeguinte = proximoMes(mes);
    const fixasProximoMes = contasFixasNoMes(mesSeguinte)
        .reduce((soma, item) => soma + Number(item.valor), 0);
    document.getElementById('projecao-mes').textContent = `Próximo mês: ${moeda.format(fixasProximoMes + todasTransacoes.filter(item => item.tipo === 'despesa' && item.fatura_mes === mesSeguinte).reduce((soma, item) => soma + Number(item.valor), 0))} já comprometidos entre contas fixas e parcelas.`;
}

function contasFixasNoMes(mes) {
    const limite = `${mes}-31`;
    const recorrentes = new Map();
    const avulsas = contasAgendadas.filter(item => item.tipo === 'despesa'
        && !item.recorrente && (item.data_vencimento || '').startsWith(mes));
    contasAgendadas.filter(item => item.tipo === 'despesa' && item.recorrente
        && item.data_vencimento <= limite).forEach(item => {
        const chave = item.serie_id || `${item.descricao.trim().toLocaleLowerCase('pt-BR')}:${item.tipo}`;
        const atual = recorrentes.get(chave);
        if (!atual || item.data_vencimento > atual.data_vencimento) recorrentes.set(chave, item);
    });
    return [...avulsas, ...recorrentes.values()];
}

function proximoMes(mes) {
    const [ano, numero] = mes.split('-').map(Number);
    const data = new Date(ano, numero, 1);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function renderizarCartoes() {
    const lista = document.getElementById('lista-cartoes');
    lista.replaceChildren();
    document.getElementById('opcoes-cartoes').replaceChildren();
    cartoes.forEach(cartao => {
        const opcao = document.createElement('option');
        opcao.value = cartao.nome;
        document.getElementById('opcoes-cartoes').appendChild(opcao);
        const faturasDoCartao = todasTransacoes.filter(item => item.tipo === 'despesa' && item.cartao === cartao.nome
            && (item.fatura_mes || '') >= dataLocalISO().slice(0, 7));
        const faturasEmAberto = faturasDoCartao.filter(item =>
            !faturasMarcadas.some(fatura => fatura.cartao_id === cartao.id
                && fatura.mes_referencia === `${item.fatura_mes}-01` && fatura.status === 'paga'));
        const gastos = faturasEmAberto.reduce((soma, item) => soma + Number(item.valor), 0);
        const mesesFatura = [...new Set(faturasDoCartao.map(item => item.fatura_mes))].sort();
        const mesAtual = mesesFatura[0] || dataLocalISO().slice(0, 7);
        const atual = faturasDoCartao.filter(item => item.fatura_mes === mesAtual)
            .reduce((soma, item) => soma + Number(item.valor), 0);
        const futuras = faturasEmAberto.filter(item => item.fatura_mes > mesAtual)
            .reduce((soma, item) => soma + Number(item.valor), 0);
        const disponivel = Math.max(0, Number(cartao.limite_total) - gastos);
        const linha = document.createElement('div');
        linha.className = 'rounded-lg bg-slate-50 p-3';
        const statusSalvo = faturasMarcadas.find(item => item.cartao_id === cartao.id && item.mes_referencia === `${mesAtual}-01`)?.status;
        const dataFechamento = fechamentoDaFatura(mesAtual, cartao);
        const statusAtual = statusSalvo || (dataLocalISO() >= dataFechamento ? 'fechada' : 'aberta');
        const listaFaturas = mesesFatura.map(mes => {
            const valor = faturasDoCartao.filter(item => item.fatura_mes === mes).reduce((soma, item) => soma + Number(item.valor), 0);
            const status = faturasMarcadas.find(item => item.cartao_id === cartao.id && item.mes_referencia === `${mes}-01`)?.status
                || (dataLocalISO() >= fechamentoDaFatura(mes, cartao) ? 'fechada' : 'aberta');
            return `${mes}: ${moeda.format(valor)} (${status})`;
        }).join(' · ');
        linha.innerHTML = `<div class="flex justify-between gap-2"><strong>${escaparHtml(cartao.nome)}</strong><span>${moeda.format(disponivel)} disponível</span></div><p class="text-xs text-slate-500">Limite ${moeda.format(Number(cartao.limite_total))} · usado ${moeda.format(gastos)} · fecha dia ${cartao.dia_fechamento} · vence dia ${cartao.dia_vencimento}</p><p class="text-xs text-slate-600">Fatura atual (${mesAtual}) ${moeda.format(atual)} · futuras ${moeda.format(futuras)} · status: ${escaparHtml(statusAtual)}</p>${listaFaturas ? `<p class="text-xs text-slate-500">Faturas: ${listaFaturas}</p>` : ''}<button type="button" data-pagar-fatura="${cartao.id}" data-mes-fatura="${mesAtual}" ${statusAtual === 'paga' ? 'disabled' : ''} class="mt-1 text-xs text-indigo-600 font-semibold disabled:text-slate-400">${statusAtual === 'paga' ? 'Fatura paga' : 'Marcar fatura atual como paga'}</button>`;
        lista.appendChild(linha);
    });
    lista.querySelectorAll('[data-pagar-fatura]').forEach(botao => botao.addEventListener('click', () => marcarFaturaPaga(botao.dataset.pagarFatura, botao.dataset.mesFatura)));
}

function fechamentoDaFatura(mesFatura, cartao) {
    let [ano, mes] = mesFatura.split('-').map(Number);
    if (Number(cartao.dia_vencimento) <= Number(cartao.dia_fechamento)) {
        mes -= 1;
        if (mes === 0) { mes = 12; ano -= 1; }
    }
    return dataMes(ano, mes, Number(cartao.dia_fechamento));
}

function escaparHtml(texto) {
    return String(texto).replace(/[&<>"']/g, caractere => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caractere]);
}

function renderizarContas() {
    const lista = document.getElementById('agenda-contas');
    lista.replaceChildren();
    const hoje = dataLocalISO();
    [...contasAgendadas].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).forEach(conta => {
        const linha = document.createElement('div');
        linha.className = 'flex items-center justify-between gap-2 border-b pb-2';
        const texto = document.createElement('span');
        texto.textContent = `${conta.descricao} · ${conta.tipo === 'receita' ? 'a receber' : 'a pagar'} · vence ${conta.data_vencimento} · ${moeda.format(Number(conta.valor))}${conta.recorrente ? ' · mensal' : ''}`;
        const acoes = document.createElement('div');
        acoes.className = 'flex items-center gap-2';
        const acao = document.createElement('button');
        acao.type = 'button';
        const statusPago = conta.tipo === 'receita' ? 'Recebido' : 'Pago';
        const acaoPendente = conta.tipo === 'receita' ? 'Marcar recebido' : 'Marcar pago';
        acao.textContent = conta.pago ? statusPago : (conta.data_vencimento < hoje ? `Vencido · ${acaoPendente.toLowerCase()}` : `Pendente · ${acaoPendente.toLowerCase()}`);
        acao.className = `text-xs font-semibold ${conta.pago ? 'text-emerald-600' : 'text-amber-700'}`;
        acao.addEventListener('click', () => alternarContaPaga(conta));
        acoes.appendChild(acao);
        if (conta.recorrente) {
            const serie = document.createElement('button');
            serie.type = 'button';
            serie.textContent = conta.ativa ? 'Pausar série' : 'Retomar série';
            serie.className = 'text-xs text-slate-500';
            serie.addEventListener('click', () => alterarSerieConta(conta));
            acoes.appendChild(serie);
        }
        linha.append(texto, acoes);
        lista.appendChild(linha);
    });
    const prazo = new Date();
    prazo.setDate(prazo.getDate() + 3);
    const dataLimite = dataLocalISO(prazo);
    const vencendo = contasAgendadas.filter(item => !item.pago && item.data_vencimento <= dataLimite);
    const aviso = document.getElementById('aviso-vencimentos');
    aviso.textContent = vencendo.length
        ? `${vencendo.length} conta(s) vencida(s) ou com vencimento nos próximos 3 dias.`
        : 'Nenhuma conta vencida ou com vencimento nos próximos 3 dias.';
    if ('Notification' in window && Notification.permission === 'granted') {
        const jaAvisadas = new Set((localStorage.getItem('contas-notificadas') || '').split(','));
        const novas = vencendo.filter(item => !jaAvisadas.has(String(item.id)));
        novas.forEach(item => new Notification('Lembrete de vencimento', {
            body: `${item.descricao} · ${moeda.format(Number(item.valor))} · vence ${item.data_vencimento}`
        }));
        novas.forEach(item => jaAvisadas.add(String(item.id)));
        localStorage.setItem('contas-notificadas', [...jaAvisadas].filter(Boolean).join(','));
    }
    atualizarDashboard();
}

function renderizarMetas() {
    const lista = document.getElementById('lista-metas');
    lista.replaceChildren();
    metasCompartilhadas.forEach(meta => {
        const atual = Number(meta.valor_atual);
        const percentual = Math.min(100, atual / Number(meta.valor_alvo) * 100);
        const item = document.createElement('div');
        item.className = 'rounded-lg bg-slate-50 p-3';
        item.innerHTML = `<div class="flex justify-between"><strong>${escaparHtml(meta.nome)}</strong><button type="button" class="text-indigo-600 text-xs font-semibold" data-meta-id="${meta.id}">Atualizar valor</button></div><p class="text-xs text-slate-500">${moeda.format(atual)} de ${moeda.format(Number(meta.valor_alvo))}</p><div class="h-2 bg-slate-200 rounded mt-2"><div class="h-2 bg-emerald-500 rounded" style="width:${percentual}%"></div></div>`;
        lista.appendChild(item);
    });
    lista.querySelectorAll('[data-meta-id]').forEach(botao => botao.addEventListener('click', () => atualizarValorMeta(botao.dataset.metaId)));
}

function renderizarDividas() {
    const lista = document.getElementById('lista-dividas');
    lista.replaceChildren();
    dividas.forEach(divida => {
        const meses = Math.ceil(Number(divida.saldo_devedor) / Number(divida.pagamento_mensal));
        const linha = document.createElement('div');
        linha.className = 'flex items-center justify-between gap-2 border-b pb-2';
        linha.innerHTML = `<span><strong>${escaparHtml(divida.nome)}</strong><br><span class="text-xs text-slate-500">${moeda.format(Number(divida.saldo_devedor))} de saldo · quitação estimada em ${meses} mês(es)</span></span><button type="button" data-divida-id="${divida.id}" class="text-xs text-indigo-600 font-semibold">Atualizar saldo</button>`;
        lista.appendChild(linha);
    });
    lista.querySelectorAll('[data-divida-id]').forEach(botao => botao.addEventListener('click', () => atualizarSaldoDivida(botao.dataset.dividaId)));
    atualizarDashboard();
}

async function carregarDadosCompartilhados() {
    const nomes = ['cartoes', 'contas_agendadas', 'metas_compartilhadas', 'dividas', 'faturas_cartao', 'recorrencias', 'orcamentos_categoria'];
    const resultados = await Promise.all(nomes.map(nome => supabaseClient.from(nome).select('*')));
    const erro = resultados.find(resultado => resultado.error)?.error;
    if (erro) {
        console.error('Erro ao carregar dados financeiros:', erro);
        mostrarMensagem(`Não foi possível carregar os dados financeiros. ${erro.message}`, 'erro');
        return;
    }
    [cartoes, contasAgendadas, metasCompartilhadas, dividas, faturasMarcadas, recorrencias, orcamentosCategoria] =
        resultados.map(resultado => resultado.data || []);
    const mes = document.getElementById('mes-filtro').value || dataLocalISO().slice(0, 7);
    const { data: planejamento, error: erroPlanejamento } = await supabaseClient.from('planejamento_mensal').select('*').eq('mes_referencia', `${mes}-01`).maybeSingle();
    if (erroPlanejamento) {
        console.error('Erro ao carregar planejamento:', erroPlanejamento);
        mostrarMensagem(`Não foi possível carregar o planejamento. ${erroPlanejamento.message}`, 'erro');
    }
    window.planejamentoMes = planejamento || {};
    document.getElementById('planejamento-ewerton').value = window.planejamentoMes.renda_ewerton || '';
    document.getElementById('planejamento-blenda').value = window.planejamentoMes.renda_blenda || '';
    document.getElementById('planejamento-despesas').value = window.planejamentoMes.despesas_previstas || '';
    renderizarCartoes();
    renderizarContas();
    renderizarMetas();
    renderizarDividas();
    renderizarRecorrencias();
    renderizarOrcamentos();
    renderizarTransacoes();
    atualizarDashboard();
}

async function gerarLancamentosDoMes(mes) {
    const [transacoesGeradas, contasGeradas] = await Promise.all([
        gerarRecorrenciasDoMes(mes),
        gerarContasRecorrentes(mes)
    ]);
    return transacoesGeradas + contasGeradas;
}

async function gerarRecorrenciasDoMes(mes) {
    const { data: modelos, error: erroModelos } = await supabaseClient
        .from('recorrencias')
        .select('*')
        .eq('ativo', true);
    if (erroModelos) throw erroModelos;

    const primeiroDia = `${mes}-01`;
    const ultimoDia = dataMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 31);
    const ocorrencias = (modelos || []).filter(modelo =>
        modelo.data_inicio <= ultimoDia && (!modelo.data_fim || modelo.data_fim >= primeiroDia))
        .map(modelo => {
            const data = dataMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), Number(modelo.dia_vencimento));
            if (data < modelo.data_inicio || (modelo.data_fim && data > modelo.data_fim)) return null;
            return {
                descricao: modelo.descricao,
                valor: modelo.valor,
                tipo: modelo.tipo,
                responsavel: modelo.responsavel,
                forma_pagamento: modelo.tipo === 'despesa' ? 'a_vista' : null,
                conta_origem: modelo.tipo === 'despesa' ? modelo.conta_origem : null,
                cartao: null,
                parcelas: null,
                recorrente: true,
                recorrencia_id: modelo.id,
                mes_competencia: primeiroDia,
                status_pagamento: 'pendente',
                data_lancamento: data,
                categoria: modelo.tipo === 'receita' ? 'Receitas' : modelo.categoria
            };
        }).filter(Boolean);
    if (!ocorrencias.length) return 0;
    const { data, error } = await supabaseClient.from('transacoes')
        .upsert(ocorrencias, { onConflict: 'recorrencia_id,mes_competencia', ignoreDuplicates: true })
        .select('id');
    if (error) throw error;
    return data?.length || 0;
}

async function gerarContasRecorrentes(mes) {
    const { data: contas, error: erroContas } = await supabaseClient
        .from('contas_agendadas')
        .select('*')
        .eq('recorrente', true)
        .eq('ativa', true);
    if (erroContas) throw erroContas;

    const porSerie = new Map();
    (contas || []).filter(conta => conta.serie_id).forEach(conta => {
        const atuais = porSerie.get(conta.serie_id) || [];
        atuais.push(conta);
        porSerie.set(conta.serie_id, atuais);
    });
    const [anoMes, mesNumero] = mes.split('-').map(Number);
    const mesAlvo = `${mes}-`;
    const ocorrencias = [];
    porSerie.forEach((itens, serieId) => {
        const ordenadas = itens.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
        const primeira = ordenadas[0];
        const ultimaAteMes = ordenadas.filter(conta => conta.data_vencimento < `${mesAlvo}32`).at(-1);
        if (!ultimaAteMes) return;
        const vencimento = dataMes(anoMes, mesNumero, Number(ultimaAteMes.data_vencimento.slice(8, 10)));
        if (vencimento < primeira.data_vencimento) return;
        ocorrencias.push({
            serie_id: serieId,
            descricao: ultimaAteMes.descricao,
            valor: ultimaAteMes.valor,
            tipo: ultimaAteMes.tipo,
            data_vencimento: vencimento,
            recorrente: true,
            ativa: true,
            pago: false
        });
    });
    if (!ocorrencias.length) return 0;
    const { data, error } = await supabaseClient.from('contas_agendadas')
        .upsert(ocorrencias, { onConflict: 'serie_id,data_vencimento', ignoreDuplicates: true })
        .select('id');
    if (error) throw error;
    return data?.length || 0;
}

function renderizarRecorrencias() {
    const lista = document.getElementById('lista-recorrencias');
    lista.replaceChildren();
    recorrencias.forEach(recorrencia => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between gap-2 border-b pb-2';
        const detalhes = document.createElement('span');
        detalhes.textContent = `${recorrencia.descricao} · ${recorrencia.tipo === 'receita' ? 'receita' : 'despesa'} · ${moeda.format(Number(recorrencia.valor))} · dia ${recorrencia.dia_vencimento} · ${recorrencia.ativo ? 'ativa' : 'pausada'}`;
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = recorrencia.ativo ? 'Pausar' : 'Ativar';
        botao.className = 'text-xs text-indigo-600 font-semibold';
        botao.addEventListener('click', () => alterarRecorrenciaAtiva(recorrencia));
        item.append(detalhes, botao);
        lista.appendChild(item);
    });
}

async function alterarRecorrenciaAtiva(recorrencia) {
    const { error } = await supabaseClient.from('recorrencias')
        .update({ ativo: !recorrencia.ativo }).eq('id', recorrencia.id);
    if (error) {
        console.error('Erro ao alterar recorrência:', error);
        mostrarMensagem(`Não foi possível alterar a recorrência. ${error.message}`, 'erro');
        return;
    }
    await carregarDadosCompartilhados();
}

function renderizarOrcamentos() {
    const lista = document.getElementById('lista-orcamentos');
    if (!lista) return;
    lista.replaceChildren();
    const mes = document.getElementById('mes-filtro').value || dataLocalISO().slice(0, 7);
    orcamentosCategoria.filter(orcamento => orcamento.mes_referencia.startsWith(mes)).forEach(orcamento => {
        const gasto = todasTransacoes.filter(transacao => transacao.tipo === 'despesa'
            && transacao.categoria === orcamento.categoria
            && (transacao.data_lancamento || '').startsWith(mes))
            .reduce((total, transacao) => total + Number(transacao.valor), 0);
        const limite = Number(orcamento.limite);
        const percentual = limite > 0 ? gasto / limite * 100 : 0;
        const alerta = percentual >= 80;
        const item = document.createElement('div');
        item.className = `rounded-lg p-3 ${alerta ? 'bg-amber-50' : 'bg-slate-50'}`;
        const topo = document.createElement('div');
        topo.className = 'flex justify-between gap-2';
        const titulo = document.createElement('strong');
        titulo.textContent = orcamento.categoria;
        const total = document.createElement('span');
        total.textContent = `${moeda.format(gasto)} / ${moeda.format(limite)}`;
        topo.append(titulo, total);
        const barra = document.createElement('div');
        barra.className = 'h-2 bg-slate-200 rounded mt-2';
        const progresso = document.createElement('div');
        progresso.className = `h-2 rounded ${alerta ? 'bg-amber-500' : 'bg-emerald-500'}`;
        progresso.style.width = `${Math.min(100, percentual)}%`;
        barra.appendChild(progresso);
        const rodape = document.createElement('div');
        rodape.className = 'flex justify-between items-center mt-1';
        const status = document.createElement('span');
        status.className = `text-xs ${alerta ? 'text-amber-800 font-semibold' : 'text-slate-500'}`;
        status.textContent = alerta
            ? `Alerta: ${percentual.toFixed(0)}% do orçamento utilizado`
            : `${percentual.toFixed(0)}% utilizado`;
        const remover = document.createElement('button');
        remover.type = 'button';
        remover.textContent = 'Remover';
        remover.className = 'text-xs text-slate-500';
        remover.addEventListener('click', () => removerOrcamento(orcamento));
        rodape.append(status, remover);
        item.append(topo, barra, rodape);
        lista.appendChild(item);
    });
}

async function removerOrcamento(orcamento) {
    const { error } = await supabaseClient.from('orcamentos_categoria')
        .delete().eq('mes_referencia', orcamento.mes_referencia).eq('categoria', orcamento.categoria);
    if (error) {
        console.error('Erro ao remover orçamento:', error);
        mostrarMensagem(`Não foi possível remover o orçamento. ${error.message}`, 'erro');
        return;
    }
    await carregarDadosCompartilhados();
}

function observarAtualizacoes() {
    if (canalTempoReal) return;
    canalTempoReal = supabaseClient.channel('financas-compartilhadas')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transacoes' }, () => carregarTransacoes())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cartoes' }, () => carregarDadosCompartilhados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contas_agendadas' }, () => carregarDadosCompartilhados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'metas_compartilhadas' }, () => carregarDadosCompartilhados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dividas' }, () => carregarDadosCompartilhados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planejamento_mensal' }, () => carregarDadosCompartilhados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'faturas_cartao' }, () => carregarDadosCompartilhados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recorrencias' }, () => carregarDadosCompartilhados())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos_categoria' }, () => carregarDadosCompartilhados())
        .subscribe(status => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Falha na assinatura Supabase Realtime:', status);
                mostrarMensagem('Sincronização em tempo real indisponível. Verifique a publicação Realtime no Supabase.', 'erro');
            }
        });
}

async function inserirRegistro(tabela, payload, mensagem) {
    const { error } = await supabaseClient.from(tabela).insert(payload);
    if (error) {
        console.error(`Erro ao salvar ${tabela}:`, error);
        mostrarMensagem(`Não foi possível salvar. ${error.message}`, 'erro');
        return false;
    }
    mostrarMensagem(mensagem);
    await carregarDadosCompartilhados();
    return true;
}

async function marcarFaturaPaga(cartaoId, mes) {
    const { error } = await supabaseClient.from('faturas_cartao').upsert({
        cartao_id: cartaoId, mes_referencia: `${mes}-01`, status: 'paga', paga_em: dataLocalISO()
    }, { onConflict: 'cartao_id,mes_referencia' });
    if (error) {
        console.error('Erro ao marcar fatura como paga:', error);
        mostrarMensagem(`Não foi possível atualizar a fatura. ${error.message}`, 'erro');
        return;
    }
    mostrarMensagem('Fatura marcada como paga.');
    await carregarDadosCompartilhados();
}

async function alternarContaPaga(conta) {
    const pago = !conta.pago;
    const serieId = conta.recorrente ? (conta.serie_id || crypto.randomUUID()) : conta.serie_id;
    const { error } = await supabaseClient.from('contas_agendadas')
        .update({ pago, serie_id: serieId }).eq('id', conta.id);
    if (error) {
        console.error('Erro ao atualizar conta:', error);
        mostrarMensagem(`Não foi possível atualizar a conta. ${error.message}`, 'erro');
        return;
    }
    if (pago && conta.recorrente && conta.ativa) {
        const proximaData = adicionarMeses(conta.data_vencimento, 1);
        const { error: erroProxima } = await supabaseClient.from('contas_agendadas').upsert({
            serie_id: serieId, descricao: conta.descricao, valor: conta.valor, tipo: conta.tipo,
            data_vencimento: proximaData, recorrente: true, ativa: true, pago: false
        }, { onConflict: 'serie_id,data_vencimento', ignoreDuplicates: true });
        if (erroProxima) {
            console.error('Erro ao agendar próxima conta recorrente:', erroProxima);
            mostrarMensagem(`Conta atualizada, mas não foi possível agendar o próximo vencimento. ${erroProxima.message}`, 'erro');
        }
    }
    await carregarDadosCompartilhados();
}

async function alterarSerieConta(conta) {
    const { error } = await supabaseClient.from('contas_agendadas')
        .update({ ativa: !conta.ativa }).eq('serie_id', conta.serie_id);
    if (error) {
        console.error('Erro ao alterar série de contas:', error);
        mostrarMensagem(`Não foi possível alterar a série. ${error.message}`, 'erro');
        return;
    }
    await carregarDadosCompartilhados();
}

async function atualizarValorMeta(id) {
    const meta = metasCompartilhadas.find(item => String(item.id) === String(id));
    const valor = Number(prompt(`Quanto já foi guardado para ${meta.nome}?`, meta.valor_atual));
    if (!Number.isFinite(valor) || valor < 0) return;
    const { error } = await supabaseClient.from('metas_compartilhadas').update({ valor_atual: valor }).eq('id', id);
    if (error) {
        console.error('Erro ao atualizar meta:', error);
        mostrarMensagem(`Não foi possível atualizar a meta. ${error.message}`, 'erro');
        return;
    }
    await carregarDadosCompartilhados();
}

async function atualizarSaldoDivida(id) {
    const divida = dividas.find(item => String(item.id) === String(id));
    const valor = Number(prompt(`Saldo devedor atualizado para ${divida.nome}:`, divida.saldo_devedor));
    if (!Number.isFinite(valor) || valor < 0) return;
    const { error } = await supabaseClient.from('dividas').update({ saldo_devedor: valor }).eq('id', id);
    if (error) {
        console.error('Erro ao atualizar dívida:', error);
        mostrarMensagem(`Não foi possível atualizar a dívida. ${error.message}`, 'erro');
        return;
    }
    await carregarDadosCompartilhados();
}

async function salvarPlanejamento(event) {
    event.preventDefault();
    const mes = document.getElementById('mes-filtro').value || dataLocalISO().slice(0, 7);
    const payload = {
        mes_referencia: `${mes}-01`,
        renda_ewerton: Number(document.getElementById('planejamento-ewerton').value || 0),
        renda_blenda: Number(document.getElementById('planejamento-blenda').value || 0),
        despesas_previstas: Number(document.getElementById('planejamento-despesas').value || 0)
    };
    const { error } = await supabaseClient.from('planejamento_mensal').upsert(payload, { onConflict: 'mes_referencia' });
    if (error) {
        console.error('Erro ao salvar planejamento:', error);
        mostrarMensagem(`Não foi possível salvar o planejamento. ${error.message}`, 'erro');
        return;
    }
    window.planejamentoMes = payload;
    atualizarDashboard();
    mostrarMensagem('Planejamento mensal salvo e compartilhado.');
}

async function criarRecorrencia(event) {
    event.preventDefault();
    const inicio = document.getElementById('recorrencia-inicio').value;
    const fim = document.getElementById('recorrencia-fim').value || null;
    const dia = Number(document.getElementById('recorrencia-dia').value);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
        mostrarMensagem('O dia do lançamento deve estar entre 1 e 31.', 'erro');
        return;
    }
    if (fim && fim < inicio) {
        mostrarMensagem('O último mês não pode ser anterior ao início da recorrência.', 'erro');
        return;
    }
    const tipo = document.getElementById('recorrencia-tipo').value;
    const payload = {
        descricao: document.getElementById('recorrencia-descricao').value.trim(),
        valor: Number(document.getElementById('recorrencia-valor').value),
        tipo,
        categoria: document.getElementById('recorrencia-categoria').value,
        responsavel: document.getElementById('recorrencia-responsavel').value,
        conta_origem: tipo === 'despesa' ? document.getElementById('recorrencia-conta').value : null,
        dia_vencimento: dia,
        data_inicio: inicio,
        data_fim: fim,
        ativo: true
    };
    const { error } = await supabaseClient.from('recorrencias').insert(payload);
    if (error) {
        console.error('Erro ao criar recorrência:', error);
        mostrarMensagem(`Não foi possível criar a recorrência. ${error.message}`, 'erro');
        return;
    }
    event.target.reset();
    document.getElementById('recorrencia-inicio').value = dataLocalISO();
    document.getElementById('recorrencia-dia').value = new Date().getDate();
    const mes = document.getElementById('mes-filtro').value || dataLocalISO().slice(0, 7);
    try {
        const quantidade = await gerarLancamentosDoMes(mes);
        await carregarTransacoes();
        await carregarDadosCompartilhados();
        mostrarMensagem(quantidade
            ? `Recorrência criada; ${quantidade} lançamento(s) do mês gerado(s).`
            : 'Recorrência criada. O primeiro lançamento será gerado no período configurado.');
    } catch (erro) {
        console.error('Recorrência salva, mas falhou a geração do mês:', erro);
        mostrarMensagem(`Recorrência criada, mas não foi possível gerar este mês. ${erro.message}`, 'erro');
        await carregarDadosCompartilhados();
    }
}

async function salvarOrcamento(event) {
    event.preventDefault();
    const mes = document.getElementById('mes-filtro').value || dataLocalISO().slice(0, 7);
    const payload = {
        mes_referencia: `${mes}-01`,
        categoria: document.getElementById('orcamento-categoria').value,
        limite: Number(document.getElementById('orcamento-limite').value)
    };
    const { error } = await supabaseClient.from('orcamentos_categoria')
        .upsert(payload, { onConflict: 'mes_referencia,categoria' });
    if (error) {
        console.error('Erro ao salvar orçamento:', error);
        mostrarMensagem(`Não foi possível salvar o orçamento. ${error.message}`, 'erro');
        return;
    }
    event.target.reset();
    await carregarDadosCompartilhados();
    mostrarMensagem(`Orçamento de ${payload.categoria} salvo para ${mes}.`);
}

async function gerarRecorrenciasSelecionadas() {
    const mes = document.getElementById('mes-filtro').value || dataLocalISO().slice(0, 7);
    try {
        const quantidade = await gerarLancamentosDoMes(mes);
        await carregarTransacoes();
        await carregarDadosCompartilhados();
        mostrarMensagem(quantidade
            ? `${quantidade} lançamento(s) novo(s) gerado(s) para ${mes}.`
            : `Nenhum lançamento novo para ${mes}; os existentes não foram duplicados.`);
    } catch (error) {
        console.error('Erro ao gerar recorrências selecionadas:', error);
        mostrarMensagem(`Não foi possível gerar recorrências. ${error.message}`, 'erro');
    }
}

function exportarCSV() {
    const transacoes = obterTransacoesFiltradas();
    const escapar = valor => {
        const texto = String(valor ?? '');
        const seguro = /^[\s]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
        return `"${seguro.replaceAll('"', '""')}"`;
    };
    const linhas = [
        ['Data', 'Descrição', 'Categoria', 'Responsável', 'Tipo', 'Forma de pagamento', 'Cartão/Conta', 'Status', 'Origem da recorrência', 'Valor'],
        ...transacoes.map(transacao => [
            transacao.data_lancamento,
            transacao.descricao,
            transacao.categoria,
            transacao.responsavel,
            transacao.tipo,
            transacao.forma_pagamento,
            transacao.cartao || transacao.conta_origem,
            transacao.status_pagamento || 'pago',
            recorrencias.find(item => item.id === transacao.recorrencia_id)?.descricao || '',
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
    document.getElementById('recorrencia-inicio').value = dataLocalISO();
    document.getElementById('recorrencia-dia').value = new Date().getDate();
    document.getElementById('conta-vencimento').value = dataLocalISO();
    document.getElementById('mes-filtro').value = dataLocalISO().slice(0, 7);
    if (!navigator.onLine) mostrarMensagem('Você está offline. Os lançamentos precisam de conexão para sincronizar.', 'erro');
    ['tipo-filtro', 'responsavel-filtro', 'categoria-filtro'].forEach(id =>
        document.getElementById(id).addEventListener('change', renderizarTransacoes));
    document.getElementById('botao-cancelar-edicao').addEventListener('click', limparFormulario);
    document.getElementById('botao-meta').addEventListener('click', salvarMeta);
    document.getElementById('botao-exportar').addEventListener('click', exportarCSV);
    document.getElementById('form-planejamento').addEventListener('submit', salvarPlanejamento);
    document.getElementById('form-recorrencia').addEventListener('submit', criarRecorrencia);
    document.getElementById('form-orcamento').addEventListener('submit', salvarOrcamento);
    document.getElementById('botao-gerar-recorrencias').addEventListener('click', gerarRecorrenciasSelecionadas);
    document.getElementById('form-cartao').addEventListener('submit', async event => {
        event.preventDefault();
        const payload = {
            nome: document.getElementById('novo-cartao-nome').value.trim(),
            limite_total: Number(document.getElementById('novo-cartao-limite').value),
            dia_fechamento: Number(document.getElementById('novo-cartao-fechamento').value),
            dia_vencimento: Number(document.getElementById('novo-cartao-vencimento').value)
        };
        if (payload.dia_fechamento < 1 || payload.dia_fechamento > 31 || payload.dia_vencimento < 1 || payload.dia_vencimento > 31) {
            mostrarMensagem('Os dias de fechamento e vencimento devem estar entre 1 e 31.', 'erro');
            return;
        }
        if (await inserirRegistro('cartoes', payload, 'Cartão cadastrado.')) event.target.reset();
    });
    document.getElementById('form-conta').addEventListener('submit', async event => {
        event.preventDefault();
        const payload = {
            descricao: document.getElementById('conta-descricao').value.trim(),
            valor: Number(document.getElementById('conta-valor').value),
            data_vencimento: document.getElementById('conta-vencimento').value,
            tipo: document.getElementById('conta-tipo').value,
            recorrente: document.getElementById('conta-fixa').checked,
            serie_id: document.getElementById('conta-fixa').checked ? crypto.randomUUID() : null,
            ativa: document.getElementById('conta-fixa').checked,
            pago: false
        };
        if (await inserirRegistro('contas_agendadas', payload, 'Conta adicionada à agenda.')) event.target.reset();
    });
    document.getElementById('form-meta-compartilhada').addEventListener('submit', async event => {
        event.preventDefault();
        const payload = {
            nome: document.getElementById('meta-nome').value.trim(),
            valor_alvo: Number(document.getElementById('meta-alvo').value),
            valor_atual: Number(document.getElementById('meta-atual').value || 0)
        };
        if (await inserirRegistro('metas_compartilhadas', payload, 'Meta compartilhada criada.')) event.target.reset();
    });
    document.getElementById('form-divida').addEventListener('submit', async event => {
        event.preventDefault();
        const payload = {
            nome: document.getElementById('divida-nome').value.trim(),
            saldo_devedor: Number(document.getElementById('divida-saldo').value),
            pagamento_mensal: Number(document.getElementById('divida-parcela').value)
        };
        if (await inserirRegistro('dividas', payload, 'Dívida cadastrada.')) event.target.reset();
    });
    document.getElementById('mes-filtro').addEventListener('change', () => {
        renderizarTransacoes();
        carregarDadosCompartilhados();
    });
    document.getElementById('botao-notificacoes').addEventListener('click', async () => {
        if (!('Notification' in window)) {
            mostrarMensagem('Este navegador não oferece suporte a notificações.', 'erro');
            return;
        }
        const permissao = await Notification.requestPermission();
        if (permissao === 'granted') {
            mostrarMensagem('Lembretes ativados para contas próximas do vencimento enquanto o app estiver aberto.');
            renderizarContas();
        } else {
            mostrarMensagem('Permissão para notificações não concedida.', 'erro');
        }
    });
    window.addEventListener('resize', atualizarDashboard);
});
