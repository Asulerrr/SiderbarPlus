import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { BrowserInfo } from '../../shared/types';

const CANDIDATE_BROWSERS: Array<{ name: string; path: string }> = [
  {
    name: 'Microsoft Edge',
    path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  },
  {
    name: 'Google Chrome',
    path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  },
  {
    name: 'Mozilla Firefox',
    path: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
  },
  {
    name: 'Brave',
    path: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  }
];

export class BrowserService {
  async listBrowsers(): Promise<BrowserInfo[]> {
    const detected = await Promise.all(
      CANDIDATE_BROWSERS.map(async (candidate) => {
        try {
          await access(candidate.path, fsConstants.X_OK);
          return {
            id: candidate.path,
            name: candidate.name,
            path: candidate.path
          } satisfies BrowserInfo;
        } catch {
          return null;
        }
      })
    );

    return [
      {
        id: 'system',
        name: '系统默认浏览器（推荐）',
        isDefault: true
      },
      ...detected.filter((browser): browser is BrowserInfo => Boolean(browser))
    ];
  }
}
