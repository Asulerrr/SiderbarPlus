import { webFrame } from 'electron';

export const installBrowserCompatibility = (parentUrl?: string): void => {
  const chromeVersion = process.versions.chrome;
  const major = chromeVersion.split('.')[0];
  const parentHref = JSON.stringify(parentUrl ?? '');
  const openerScript = parentUrl === undefined
    ? ''
    : `
      Object.defineProperty(window, 'opener', {
        get: () => ({
          postMessage: (data, targetOrigin) => {
            window.__sidebarGoogleLogin?.postCredential(data, targetOrigin);
          },
          location: { href: ${parentHref} },
          closed: false
        }),
        configurable: true
      });
    `;

  void webFrame.executeJavaScript(`
    (() => {
      try {
        Object.defineProperty(navigator, 'userAgentData', {
          configurable: false,
          value: {
            brands: [
              { brand: 'Not/A)Brand', version: '8' },
              { brand: 'Chromium', version: '${major}' },
              { brand: 'Google Chrome', version: '${major}' }
            ],
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: async () => ({
              brands: [
                { brand: 'Not/A)Brand', version: '8' },
                { brand: 'Chromium', version: '${chromeVersion}' },
                { brand: 'Google Chrome', version: '${chromeVersion}' }
              ],
              mobile: false,
              platform: 'Windows',
              platformVersion: '15.0.0',
              architecture: 'x86',
              bitness: '64',
              uaFullVersion: '${chromeVersion}'
            })
          }
        });
      } catch {}

      ${openerScript}

      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) {
        window.chrome.runtime = {
          sendMessage: () => {},
          connect: () => ({
            onMessage: { addListener: () => {} },
            postMessage: () => {},
            disconnect: () => {}
          }),
          onMessage: { addListener: () => {} },
          onConnect: { addListener: () => {} }
        };
      }
    })();
  `).catch(() => undefined);
};
