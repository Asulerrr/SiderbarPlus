// Preload for Google login popups.
// 1. Spoofs UA data so Google doesn't reject Electron
// 2. Overrides window.opener with a fake that sends GIS credentials via IPC
//    (Google's COOP header nullifies the real opener, breaking postMessage)
const { ipcRenderer } = require('electron');

const chromeVersion = process.versions.chrome;
const major = chromeVersion.split('.')[0];

try {
  Object.defineProperty(navigator, 'userAgentData', {
    configurable: false,
    writable: false,
    value: {
      brands: [
        { brand: 'Not/A)Brand', version: '8' },
        { brand: 'Chromium', version: major },
        { brand: 'Google Chrome', version: major }
      ],
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: async () => ({
        brands: [
          { brand: 'Not/A)Brand', version: '8' },
          { brand: 'Chromium', version: chromeVersion },
          { brand: 'Google Chrome', version: chromeVersion }
        ],
        mobile: false,
        platform: 'Windows',
        platformVersion: '15.0.0',
        architecture: 'x86',
        bitness: '64',
        uaFullVersion: chromeVersion,
        fullVersionList: [
          { brand: 'Not/A)Brand', version: '8.0.0.0' },
          { brand: 'Chromium', version: chromeVersion },
          { brand: 'Google Chrome', version: chromeVersion }
        ]
      })
    }
  });
} catch { /* already defined in this context */ }

// Override window.opener with a fake opener that captures GIS credentials.
// Google sends Cross-Origin-Opener-Policy: same-origin which nullifies the
// real opener. Our fake opener intercepts postMessage and sends the credential
// to the main process via IPC, which forwards it to the parent panel.
try {
  const parentUrl: string = (() => {
    try { return ipcRenderer.sendSync('get-parent-url'); } catch { return ''; }
  })();

  Object.defineProperty(window, 'opener', {
    get: () => ({
      postMessage: (data: unknown, targetOrigin?: string) => {
        console.log('[GoogleLogin:preload] postMessage intercepted', typeof data, JSON.stringify(data)?.substring(0, 500), targetOrigin);
        try {
          ipcRenderer.send('google-login-credential', data);
        } catch (e) {
          console.log('[GoogleLogin:preload] IPC send failed:', e);
        }
      },
      location: { href: parentUrl },
      closed: false
    }),
    configurable: true,
    enumerable: true
  });
  console.log('[GoogleLogin:preload] window.opener overridden');
} catch (e) {
  console.log('[GoogleLogin:preload] opener override failed:', e);
}

try {
  window.chrome = {
    runtime: {
      sendMessage: () => {},
      connect: () => ({
        onMessage: { addListener: () => {} },
        postMessage: () => {},
        disconnect: () => {}
      }),
      onMessage: { addListener: () => {} },
      onConnect: { addListener: () => {} },
      lastError: undefined,
      id: undefined
    },
    loadTimes: () => ({}),
    csi: () => ({}),
    app: {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
    }
  };
} catch { /* */ }
