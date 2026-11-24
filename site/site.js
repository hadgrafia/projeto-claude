// Animação ao rolar a página.
const obs = 'IntersectionObserver' in window
  ? new IntersectionObserver((entradas) => {
      for (const e of entradas) if (e.isIntersecting) { e.target.classList.add('visivel'); obs.unobserve(e.target); }
    }, { threshold: 0.12 })
  : null;
document.querySelectorAll('.revelar').forEach((el) => (obs ? obs.observe(el) : el.classList.add('visivel')));

// Pedido de convite.
const form = document.getElementById('form-convite');
const retorno = form.querySelector('.retorno');
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const dados = Object.fromEntries(new FormData(form));
  dados.aceite = form.aceite.checked;
  retorno.className = 'retorno';
  if (!String(dados.nome).trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(dados.email))) {
    retorno.textContent = 'Preencha seu nome e um e-mail válido.';
    retorno.classList.add('erro');
    return;
  }
  const s = String(dados.senha || '');
  if (s.length < 8 || !/[a-zA-ZÀ-ú]/.test(s) || !/\d/.test(s)) {
    retorno.textContent = 'A senha precisa ter pelo menos 8 caracteres, com letras e números.';
    retorno.classList.add('erro');
    return;
  }
  if (!dados.aceite) {
    retorno.textContent = 'Para continuar, concorde com a política de privacidade.';
    retorno.classList.add('erro');
    return;
  }
  const botao = form.querySelector('button');
  botao.disabled = true;
  retorno.textContent = 'Enviando…';
  try {
    const r = await fetch('./api/pedido-convite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
    const c = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(c.erro || 'Não foi possível enviar agora.');
    form.reset();
    retorno.innerHTML = '';
    retorno.append(
      c.jaPedido ? 'Seu pedido já estava na fila (a senha foi atualizada). ' : 'Pronto! Seu pedido foi enviado. ',
      'Assim que for aprovado (normalmente em até 1 dia), é só entrar com o seu e-mail e a senha que você criou. ',
    );
    const a = document.createElement('a');
    a.href = './entrar/';
    a.textContent = 'Ir para Entrar';
    retorno.append(a);
    retorno.classList.add('ok');
  } catch (e) {
    retorno.textContent = e.message;
    retorno.classList.add('erro');
  } finally {
    botao.disabled = false;
  }
});

// Desliga o app antigo que ficava na raiz (agora ele mora em /app/).
navigator.serviceWorker?.getRegistrations?.().then((regs) => regs.filter((r) => !r.scope.includes('/app/')).forEach((r) => r.unregister()));
