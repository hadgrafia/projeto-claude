import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base relativo: funciona em qualquer hospedagem estática (GitHub Pages, Cloudflare Pages, Capacitor).
// O app fica em /app/ (só convidados); a página de apresentação pública fica na raiz (pasta site/).
export default defineConfig({
  base: './',
  build: { outDir: 'dist/app', emptyOutDir: true },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a versão nova espera a pessoa tocar em "Atualizar" (ou entra ao reabrir o app).
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // Tudo que o app precisa fica guardado no aparelho: abre e funciona sem internet.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mjs}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // /api, a página Entrar e a confirmação do e-mail sempre vão para a rede.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//, /^\/entrar/, /^\/conta\//],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Meus Planos Financeiros',
        short_name: 'Meus Planos',
        description: 'Planeje e acompanhe seus planos financeiros, mesmo sem internet.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F0EBE1',
        theme_color: '#3B4A3A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});
