import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          dock: resolve(__dirname, 'src/preload/dock.ts'),
          panel: resolve(__dirname, 'src/preload/panel.ts'),
          panelMenu: resolve(__dirname, 'src/preload/panelMenu.ts'),
          panelAnimation: resolve(__dirname, 'src/preload/panelAnimation.ts'),
          webPanel: resolve(__dirname, 'src/preload/webPanel.ts'),
          builtin: resolve(__dirname, 'src/preload/builtin.ts')
        }
      }
    }
  },
  renderer: {
    server: { port: 1212, strictPort: false, host: '127.0.0.1' },
    optimizeDeps: { include: ['lucide-react'] },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          dock: resolve(__dirname, 'src/renderer/dock/index.html'),
          panel: resolve(__dirname, 'src/renderer/panel-chrome/index.html'),
          panelMenu: resolve(__dirname, 'src/renderer/panel-menu/index.html'),
          panelAnimation: resolve(__dirname, 'src/renderer/panel-animation/index.html')
        }
      }
    },
    plugins: [react()]
  }
});
