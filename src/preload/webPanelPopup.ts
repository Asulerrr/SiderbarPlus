// Standalone popup preload — contextIsolation: false, preload runs in page world.
// Object.defineProperty is synchronous and guaranteed before any page JS.
const chromeVersion = process.versions.chrome;
const major = chromeVersion.split('.')[0];

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
        { brand: 'Chromium', version: major },
        { brand: 'Google Chrome', version: major }
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
