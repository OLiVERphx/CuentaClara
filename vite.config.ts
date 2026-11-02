import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: la app funciona igual en la raíz de un dominio o en una subcarpeta.
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      // 'prompt': nunca recargar sola en medio de una operación; se avisa y el usuario decide.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icono.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Bodega — Gestión del negocio',
        short_name: 'Bodega',
        description: 'Inventario, precios en USD y Bs, ventas, caja, fiao y proveedores.',
        lang: 'es-VE',
        theme_color: '#0f766e',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
