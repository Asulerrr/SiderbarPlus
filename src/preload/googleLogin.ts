import { contextBridge, ipcRenderer } from 'electron';
import { installBrowserCompatibility } from './browserCompatibility';

const parentUrl = (() => {
  try {
    return ipcRenderer.sendSync('get-parent-url') as string;
  } catch {
    return '';
  }
})();

contextBridge.exposeInMainWorld('__sidebarGoogleLogin', {
  postCredential: (data: unknown) => {
    ipcRenderer.send('google-login-credential', data);
  }
});

installBrowserCompatibility(parentUrl);
