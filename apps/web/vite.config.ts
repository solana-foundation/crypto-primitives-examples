import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
    build: {
        target: 'esnext',
    },
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    },
    esbuild: {
        target: 'esnext',
    },
    plugins: [react(), wasm(), topLevelAwait()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        tsconfigPaths: true,
    },
    server: {
        proxy: {
            '/rpc': {
                changeOrigin: true,
                rewrite: proxyPath => proxyPath.replace(/^\/rpc/, ''),
                target: 'http://localhost:8899',
                ws: true,
            },
        },
    },
});
