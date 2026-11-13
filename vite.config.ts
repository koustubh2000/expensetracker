import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import {
  CANONICAL_KOUSTUBH_VAULT,
  getCanonicalSeedUsers,
} from './src/utils/canonicalCloudSeed';

const MIRROR_FILE_PATH = path.resolve(__dirname, '.cloud-vault-mirror.json');

interface CloudMirrorStore {
  users: any[];
  deletedUserIds: string[];
  vaults: Record<string, any>;
  globalConfig?: {
    landingHeroImage?: string | null;
    pdfHeaderConfig?: any;
    updatedAt?: number;
  };
}

function loadMirrorStore(): CloudMirrorStore {
  try {
    if (fs.existsSync(MIRROR_FILE_PATH)) {
      const raw = fs.readFileSync(MIRROR_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as CloudMirrorStore;
      if (parsed && Array.isArray(parsed.users) && parsed.vaults) {
        return {
          users: parsed.users,
          deletedUserIds: Array.isArray(parsed.deletedUserIds) ? parsed.deletedUserIds : [],
          vaults: parsed.vaults,
          globalConfig:
            parsed.globalConfig && typeof parsed.globalConfig === 'object'
              ? parsed.globalConfig
              : undefined,
        };
      }
    }
  } catch {
    // fallback below
  }
  const initial: CloudMirrorStore = {
    users: getCanonicalSeedUsers(),
    deletedUserIds: [],
    vaults: {
      'user-1794238795911': CANONICAL_KOUSTUBH_VAULT,
    },
  };
  try {
    fs.writeFileSync(MIRROR_FILE_PATH, JSON.stringify(initial, null, 2), 'utf8');
  } catch {
    // ignore
  }
  return initial;
}

function saveMirrorStore(store: CloudMirrorStore): void {
  try {
    fs.writeFileSync(MIRROR_FILE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

function cloudVaultMirrorPlugin(): Plugin {
  return {
    name: 'cloud-vault-mirror',
    configureServer(server) {
      server.middlewares.use('/api/vault-mirror', (req, res, next) => {
        if (req.method === 'GET') {
          const store = loadMirrorStore();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(store));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const store = loadMirrorStore();
              if (Array.isArray(payload.users)) {
                const deletedSet = new Set(store.deletedUserIds || []);
                store.users = payload.users.filter(
                  (u: any) => u && (u.id === 'user-admin' || !deletedSet.has(u.id))
                );
              }
              if (typeof payload.deleteUserId === 'string' && payload.deleteUserId !== 'user-admin') {
                const delId = payload.deleteUserId;
                if (!store.deletedUserIds.includes(delId)) {
                  store.deletedUserIds.push(delId);
                }
                store.users = store.users.filter((u: any) => u && u.id !== delId);
                delete store.vaults[delId];
              }
              const targetVaultUserId =
                (typeof payload.userId === 'string' && payload.userId) ||
                (payload.vault && typeof payload.vault.userId === 'string' && payload.vault.userId);
              if (targetVaultUserId && payload.vault) {
                store.vaults[targetVaultUserId] = payload.vault;
              }
              if (payload.globalConfig && typeof payload.globalConfig === 'object') {
                store.globalConfig = {
                  ...(store.globalConfig || {}),
                  ...payload.globalConfig,
                  updatedAt: payload.globalConfig.updatedAt || Date.now(),
                };
              }
              saveMirrorStore(store);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false }));
            }
          });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      cloudVaultMirrorPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeManifestIcons: true,
        manifest: {
          id: '/',
          name: 'ExpenseTracker — Personal Finance & Bill Manager',
          short_name: 'ExpenseTrack',
          description: 'Multi-account wallet, dream investment tracker, lending ledger, and HD PDF bill exporter.',
          theme_color: '#059669',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: [
            '**/node_modules/**/*',
            'sw.js',
            'workbox-*.js',
            'assets/aistudio/image_*',
            'assets/aistudio/*.html',
          ],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
