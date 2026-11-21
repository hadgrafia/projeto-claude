import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base relativo: funciona em qualquer hospedagem estática (GitHub Pages, Cloudflare Pages, Capacitor).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        // Tudo que o app precisa fica guardado no aparelho: abre e funciona sem internet.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mjs}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // /api e o login do Cloudflare Access sempre vão para a rede.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
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
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});
