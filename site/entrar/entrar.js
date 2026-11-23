// Página Entrar: conta com e-mail e senha. A conta só é criada pelo link de convite pessoal.
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// Para onde ir depois de entrar: só dentro do app (nunca para outro site).
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

// O código do convite sai da barra de endereço logo que a página abre (não fica no histórico).
const convite = params.get('convite') || params.get('senha');
const tipoLink = params.get('senha') ? 'senha' : 'conta';
if (convite) history.replaceState(null, '', location.pathname);

const telas = ['#form-entrar', '#sem-convite', '#esqueci-info', '#form-convite', '#convite-invalido'];
function mostrar(qual) {
  for (const t of telas) $(t).hidden = t !== qual;
  const criar = qual === '#sem-convite' || qual === '#form-convite';
  $('#aba-entrar').setAttribute('aria-selected', String(!criar));
  $('#aba-criar').setAttribute('aria-selected', String(criar));
}
$('#aba-entrar').addEventListener('click', () => mostrar('#form-entrar'));
$('#aba-criar').addEventListener('click', () => mostrar(convite ? '#form-convite' : '#sem-convite'));
$('#esqueci').addEventListener('click', () => mostrar('#esqueci-info'));
$('#voltar-entrar').addEventListener('click', () => mostrar('#form-entrar'));
$('#ir-entrar').addEventListener('click', () => mostrar('#form-entrar'));

document.querySelectorAll('.mostrar').forEach((b) =>
  b.addEventListener('click', () => {
    const campo = b.previousElementSibling;
    const ver = campo.type === 'password';
    campo.type = ver ? 'text' : 'password';
    b.textContent = ver ? 'Esconder' : 'Mostrar';
  }),
);

async function enviar(url, corpo) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(c.erro || 'Não foi possível agora. Tente de novo em instantes.');
  return c;
}
const avisar = (form, msg, tipo = 'erro') => {
  const el = form.querySelector('.retorno');
  el.textContent = msg;
  el.className = `retorno ${tipo}`;
};

// Entrar
const fEntrar = $('#form-entrar');
fEntrar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = fEntrar.email.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return avisar(fEntrar, 'Digite um e-mail válido.');
  if (!fEntrar.senha.value) return avisar(fEntrar, 'Digite sua senha.');
  const pedeCodigo = !$('#passo-codigo').hidden;
  const codigo = fEntrar.codigo.value.trim();
  if (pedeCodigo && !codigo) return avisar(fEntrar, 'Digite o código do app autenticador.');
  const botao = fEntrar.querySelector('[type=submit]');
  botao.disabled = true;
  avisar(fEntrar, 'Entrando…', '');
  try {
    const r = await enviar('/api/conta/entrar', { email, senha: fEntrar.senha.value, ...(pedeCodigo ? { codigo } : {}) });
    if (r.precisaCodigo) {
      // Verificação em duas etapas: a senha está certa, falta o código do app autenticador.
      $('#passo-codigo').hidden = false;
      fEntrar.codigo.focus();
      return avisar(fEntrar, 'Senha certa. Agora digite o código do app autenticador.', '');
    }
    avisar(fEntrar, 'Tudo certo!', 'ok');
    irParaApp();
  } catch (e) {
    avisar(fEntrar, navigator.onLine ? e.message : 'Sem internet. Conecte-se para entrar.');
  } finally {
    botao.disabled = false;
  }
});

// Criar conta (ou senha nova) pelo link pessoal
const fConvite = $('#form-convite');
function regras() {
  const s = fConvite.senha.value;
  const r = { tamanho: s.length >= 8, mistura: /[a-zA-ZÀ-ú]/.test(s) && /\d/.test(s), igual: s.length > 0 && s === fConvite.confirmar.value };
  document.querySelectorAll('#regras li').forEach((li) => li.classList.toggle('ok', r[li.dataset.regra]));
  return r;
}
fConvite.senha.addEventListener('input', regras);
fConvite.confirmar.addEventListener('input', regras);
fConvite.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const r = regras();
  if (!r.tamanho || !r.mistura) return avisar(fConvite, 'A senha precisa ter pelo menos 8 caracteres, com letras e números.');
  if (!r.igual) return avisar(fConvite, 'As duas senhas não estão iguais.');
  const botao = $('#enviar-convite');
  botao.disabled = true;
  avisar(fConvite, 'Criando…', '');
  try {
    await enviar('/api/conta/cadastro', { convite, senha: fConvite.senha.value });
    avisar(fConvite, tipoLink === 'senha' ? 'Senha nova salva! Abrindo o app…' : 'Conta criada! Abrindo o app…', 'ok');
    setTimeout(irParaApp, 700);
  } catch (e) {
    avisar(fConvite, navigator.onLine ? e.message : 'Sem internet. Conecte-se para continuar.');
  } finally {
    botao.disabled = false;
  }
});

if (convite) {
  if (tipoLink === 'senha') {
    $('#titulo-convite').textContent = 'Crie uma senha nova';
    $('#sub-convite').textContent = 'Escolha a senha nova. Por segurança, os outros aparelhos serão desconectados.';
    $('#enviar-convite').textContent = 'Salvar senha e entrar';
  }
  mostrar('#form-convite');
  fetch(`/api/conta/convite?t=${encodeURIComponent(convite)}`)
    .then(async (r) => {
      const c = await r.json().catch(() => ({}));
      if (!r.ok) {
        $('#motivo-invalido').textContent = c.erro || 'Ele já foi usado ou passou do prazo. Peça um link novo a quem te convidou.';
        return mostrar('#convite-invalido');
      }
      fConvite.email.value = c.email;
      fConvite.senha.focus();
    })
    .catch(() => avisar(fConvite, 'Sem internet. Conecte-se para continuar.'));
} else {
  // Já está logado: vai direto para o app.
  fetch('/api/conta/estado', { credentials: 'same-origin' })
    .then((r) => r.json())
    .then((r) => r.logado && irParaApp())
    .catch(() => undefined);
}
