// Recebe o que a pessoa compartilha com o Meus Planos (comprovante em PDF, texto ou extrato).
// Guarda por um instante no próprio aparelho e abre a tela "Novo lançamento", que lê e apaga.
self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);
  if (evento.request.method !== 'POST' || !url.pathname.endsWith('/app/compartilhar')) return;
  evento.respondWith(
    (async () => {
      const destino = new URL('./#/lancar?compartilhado=1', self.registration.scope).href;
      try {
        const f = await evento.request.formData();
        const arquivo = f.get('arquivo');
        const temArquivo = arquivo && typeof arquivo === 'object' && arquivo.size > 0 && arquivo.size < 15 * 1024 * 1024;
        const dados = {
          titulo: String(f.get('titulo') || '').slice(0, 300),
          texto: String(f.get('texto') || '').slice(0, 4000),
          link: String(f.get('link') || '').slice(0, 500),
          nome: temArquivo ? arquivo.name : '',
          tipo: temArquivo ? arquivo.type : '',
        };
        await caches.delete('mp-compartilhado');
        const cache = await caches.open('mp-compartilhado');
        await cache.put('dados', new Response(JSON.stringify(dados)));
        if (temArquivo) await cache.put('arquivo', new Response(arquivo));
      } catch (e) {
        /* abre a tela mesmo assim, para preencher à mão */
      }
      return Response.redirect(destino, 303);
    })(),
  );
});
