// Quem instalou o app antigo na tela inicial cai aqui: leva direto para o app.
if (window.matchMedia('(display-mode: standalone)').matches) location.replace('./app/');
