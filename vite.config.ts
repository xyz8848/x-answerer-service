import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import pkg from './package.json';

export default defineConfig({
  plugins: [reactRouter(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app'),
    },
  },
  define: {
    // 注入 package.json 版本号，前端可通过全局常量 __APP_VERSION__ 读取
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
