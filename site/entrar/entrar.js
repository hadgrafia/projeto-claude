// Página Entrar: conta com e-mail e senha (só para e-mails convidados).
const $ = (s) => document.querySelector(s);
const form = $('#form-conta');
const retorno = form.querySelector('.retorno');
let modo = 'entrar'; // entrar | criar | trocar

// Para onde ir depois de entrar: só dentro do app (nunca para outro site).
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const params = new URLSearchParams(location.search);
const volta = params.get('volta');
if (volta && /^\/app\/[\w./-]*$/.test(volta)) guardar('mp_volta', JSON.stringify({ url: volta + location.hash, em: Date.now() }));
function destino() {
  try {
    const v = JSON.parse(ler('mp_volta') || 'null');
    if (v && Date.now() - v.em < 3600_000 && /^\/app\/[^#]*(#\/[\w/?=&%.-]*)?$/.test(v.url)) return v.url;
  } catch { /* ignora */ }
  return '/app/';
}
const irParaApp = () => {
  const d = destino();
  guardar('mp_volta', '');
  location.replace(d);
};

// Animação do desenho.
requestAnimationFrame(() => document.querySelectorAll('.revelar').forEach((el) => el.classList.add('visivel')));

// Volta da confirmação do e-mail (conta criada) ou já está logado: abre o app.
if (params.get('pronto') === '1') {
  $('#tela-form').hidden = true;
  $('#tela-pronto').hidden = false;
  $('#ir-app').href = destino();
  setTimeout(irParaApp, 1200);
} else {
  fetch('/api/conta/estado', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((r) => r.logado && irParaApp())
    .catch(() => undefined);
}

const TEXTOS = {
  entrar: { titulo: 'Que bom te ver de novo', sub: 'Use o e-mail e a senha da sua conta.', botao: 'Entrar' },
  criar: { titulo: 'Crie sua conta', sub: 'Use o e-mail que recebeu o convite e escolha uma senha.', botao: 'Criar conta' },
  trocar: { titulo: 'Criar uma senha nova', sub: 'Digite o e-mail da sua conta e a senha nova. Vamos confirmar com um código no seu e-mail.', botao: 'Trocar senha' },
};
function mudar(novo) {
  modo = novo;
  const t = TEXTOS[modo];
  $('#titulo').textContent = t.titulo;
  $('#subtitulo').textContent = t.sub;
  $('#enviar').textContent = t.botao;
  const nova = modo !== 'entrar';
  $('#campo-confirmar').hidden = !nova;
  $('#regras').hidden = !nova;
  form.senha.autocomplete = nova ? 'new-password' : 'current-password';
  $('#esqueci').hidden = modo === 'trocar';
  $('#aba-entrar').setAttribute('aria-selected', String(modo === 'entrar'));
  $('#aba-criar').setAttribute('aria-selected', String(modo !== 'entrar'));
  retorno.textContent = '';
  retorno.className = 'retorno';
  regras();
}
$('#aba-entrar').addEventListener('click', () => mudar('entrar'));
$('#aba-criar').addEventListener('click', () => mudar('criar'));
$('#esqueci').addEventListener('click', () => mudar('trocar'));
if (params.get('modo') === 'criar') mudar('criar');

document.querySelectorAll('.mostrar').forEach((b) =>
  b.addEventListener('click', () => {
    const campo = form[b.dataset.alvo];
    const ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    b.textContent = ver ? 'Esconder' : 'Mostrar';
  }),
);

function regras() {
  const s = form.senha.value;
  const r = { tamanho: s.length >= 8, mistura: /[a-zA-ZÀ-ú]/.test(s) && /\d/.test(s), igual: s.length > 0 && s === form.confirmar.value };
  document.querySelectorAll('#regras li').forEach((li) => li.classList.toggle('ok', r[li.dataset.regra]));
  return r;
}
form.senha.addEventListener('input', regras);
form.confirmar.addEventListener('input', regras);

function erro(msg) {
  retorno.textContent = msg;
  retorno.className = 'retorno erro';
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = form.email.value.trim().toLowerCase();
  const senha = form.senha.value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('Digite um e-mail válido.');
  if (!senha) return erro('Digite sua senha.');
  if (modo !== 'entrar') {
    const r = regras();
    if (!r.tamanho || !r.mistura) return erro('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
    if (!r.igual) return erro('As duas senhas não estão iguais.');
  }
  const botao = $('#enviar');
  botao.disabled = true;
  retorno.className = 'retorno';
  retorno.textContent = modo === 'entrar' ? 'Entrando…' : 'Preparando…';
  try {
    const r = await fetch(`/api/conta/${modo === 'entrar' ? 'entrar' : 'cadastro'}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.erro || 'Não foi possível agora. Tente de novo em instantes.');
    if (modo === 'entrar') {
      retorno.textContent = 'Tudo certo!';
      irParaApp();
      return;
    }
    // Cadastro guardado: falta confirmar o e-mail com o código.
    $('#email-codigo').textContent = email;
    $('#ir-codigo').href = c.confirmar;
    $('#tela-form').hidden = true;
    $('#tela-codigo').hidden = false;
    form.senha.value = '';
    form.confirmar.value = '';
  } catch (e) {
    erro(navigator.onLine ? e.message : 'Sem internet. Conecte-se para entrar.');
  } finally {
    botao.disabled = false;
  }
});

$('#voltar-form').addEventListener('click', () => {
  $('#tela-codigo').hidden = true;
  $('#tela-form').hidden = false;
});
