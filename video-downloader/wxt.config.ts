import { defineConfig } from 'wxt';

// Une seule base de code pour Chrome, Edge et Firefox (Manifest V3).
// Build : `npm run build` (chrome) · `build:edge` · `build:firefox`
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'fr',
    permissions: [
      'webRequest',
      'storage',
      'downloads',
      'declarativeNetRequest',
      // L'API offscreen n'existe que sur Chromium (Chrome/Edge).
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'video-downloader@example.invalid', // à remplacer avant publication
              strict_min_version: '128.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  } as any),
});
