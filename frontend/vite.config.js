import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        proxy: { '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://localhost:5000', changeOrigin: false } },
    },
    build: { sourcemap: true },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.js'],
        css: false,
    },
});
