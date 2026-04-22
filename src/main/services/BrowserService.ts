import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserInfo } from '../../shared/types';

interface BrowserCandidate {
  id: string;
  name: string;
  paths: string[];
}

const localAppData = process.env.LOCALAPPDATA ?? 'C:\\Users\\Public\\AppData\\Local';

const BROWSER_CANDIDATES: BrowserCandidate[] = [
  {
    id: 'msedge',
    name: 'Microsoft Edge',
    paths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ]
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    paths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ]
  },
  {
    id: 'firefox',
    name: 'Mozilla Firefox',
    paths: [
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
    ]
  },
  {
    id: 'brave',
    name: 'Brave',
    paths: [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ]
  },
  {
    id: 'opera',
    name: 'Opera',
    paths: [
      join(localAppData, 'Programs', 'Opera', 'launcher.exe'),
      'C:\\Program Files\\Opera\\launcher.exe'
    ]
  }
];

const canExecute = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const matchBrowserCandidate = (browserSelection: string): BrowserCandidate | null =>
  BROWSER_CANDIDATES.find(
    (candidate) =>
      candidate.id === browserSelection ||
      candidate.paths.some((candidatePath) => candidatePath.toLowerCase() === browserSelection.toLowerCase())
  ) ?? null;

export class BrowserService {
  async listBrowsers(): Promise<BrowserInfo[]> {
    const detected = await Promise.all(
      BROWSER_CANDIDATES.map(async (candidate) => {
        const executablePath = await this.resolveExecutable(candidate.id);
        if (!executablePath) {
          return null;
        }

        return {
          id: candidate.id,
          name: candidate.name,
          path: executablePath
        } satisfies BrowserInfo;
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

  async resolveExecutable(browserSelection: string): Promise<string | null> {
    if (!browserSelection || browserSelection === 'system') {
      return null;
    }

    const candidate = matchBrowserCandidate(browserSelection);
    if (candidate) {
      for (const executablePath of candidate.paths) {
        if (await canExecute(executablePath)) {
          return executablePath;
        }
      }
    }

    return (await canExecute(browserSelection)) ? browserSelection : null;
  }
}
