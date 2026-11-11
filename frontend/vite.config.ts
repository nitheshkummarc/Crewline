// Vite build, dev proxy to the API, and Vitest settings.
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.CREWLINE_API ?? 'http://127.0.0.1:8000';
// Absolute site URL for og:url and og:image; set CREWLINE_PUBLIC_URL when building for a deploy.
const publicUrl = (process.env.CREWLINE_PUBLIC_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/** Replace %PUBLIC_URL% in index.html with the absolute site URL. */
function publicUrlPlugin(): Plugin {
  return { name: 'crewline-public-url', transformIndexHtml: (html) => html.replaceAll('%PUBLIC_URL%', publicUrl) };
}

export default defineConfig({
  plugins: [react(), publicUrlPlugin()],
  server: {
    port: 5173,
    // Same-origin in dev too: the session cookie and the event stream need no CORS.
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
