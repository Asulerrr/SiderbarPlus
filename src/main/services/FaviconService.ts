import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { net } from 'electron';
import sharp from 'sharp';
import type { FaviconFetchResult } from '../../shared/types';
import { getFaviconCachePath } from '../utils/paths';
import { logger } from '../utils/logger';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_KEY_VERSION = 2;
const REQUEST_TIMEOUT_MS = 2500;
const MAX_HTML_ICON_CANDIDATES = 4;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const FALLBACK_COLORS = ['#375a7f', '#5f4b8b', '#3f6f62', '#8a5a44', '#6f5f3f'];

interface IconCandidate {
  url: string;
  source: FaviconFetchResult['source'];
  score: number;
}

interface ResolvedIcon {
  buffer: Buffer;
  source: FaviconFetchResult['source'];
}

export class FaviconService {
  private readonly inflight = new Map<string, Promise<FaviconFetchResult>>();

  async fetch(url: string): Promise<FaviconFetchResult> {
    const normalizedUrl = normalizeUrl(url);
    const existing = this.inflight.get(normalizedUrl);
    if (existing) return existing;

    const work = this.doFetch(normalizedUrl).finally(() => {
      this.inflight.delete(normalizedUrl);
    });
    this.inflight.set(normalizedUrl, work);
    return work;
  }

  private async doFetch(normalizedUrl: string): Promise<FaviconFetchResult> {
    const target = new URL(normalizedUrl);
    const fallbackLetter = buildFallbackLetter(target);
    const fallbackColor = buildFallbackColor(target.hostname);
    const cachePath = await this.getCachePath(target);

    const cached = await this.readFreshCache(cachePath);
    if (cached) {
      return {
        url: normalizedUrl,
        iconPath: cachePath,
        dataUrl: bufferToDataUrl(cached),
        source: 'cache',
        fallbackLetter,
        fallbackColor
      };
    }

    const resolved = await this.fetchFirstSiteIcon(target);
    if (resolved) {
      await mkdir(getFaviconCachePath(), { recursive: true });
      await writeFile(cachePath, resolved.buffer);

      return {
        url: normalizedUrl,
        iconPath: cachePath,
        dataUrl: bufferToDataUrl(resolved.buffer),
        source: resolved.source,
        fallbackLetter,
        fallbackColor
      };
    }

    const fallbackBuffer = await this.createLetterIcon(fallbackLetter, fallbackColor);

    return {
      url: normalizedUrl,
      dataUrl: bufferToDataUrl(fallbackBuffer),
      source: 'letter',
      fallbackLetter,
      fallbackColor
    };
  }

  private async readFreshCache(cachePath: string): Promise<Buffer | null> {
    try {
      const stats = await stat(cachePath);
      if (Date.now() - stats.mtimeMs > CACHE_TTL_MS) {
        return null;
      }

      return await readFile(cachePath);
    } catch {
      return null;
    }
  }

  private async fetchFirstSiteIcon(target: URL): Promise<ResolvedIcon | null> {
    const directCandidate: IconCandidate = {
      url: new URL('/favicon.ico', target.origin).toString(),
      source: 'favicon',
      score: 32
    };
    const htmlAttempt = this.buildHtmlCandidates(target).then((candidates) => {
      const attempts = candidates
        .slice(0, MAX_HTML_ICON_CANDIDATES)
        .map((candidate) => this.fetchCandidate(candidate));
      return attempts.length > 0
        ? Promise.any(attempts)
        : Promise.reject(new Error('No favicon links found in HTML'));
    });

    try {
      return await Promise.any([
        this.fetchCandidate(directCandidate),
        htmlAttempt
      ]);
    } catch {
      return null;
    }
  }

  private async buildHtmlCandidates(target: URL): Promise<IconCandidate[]> {
    try {
      const html = await requestText(target.toString());
      return dedupeCandidates(parseIconCandidates(html, target))
        .sort((left, right) => right.score - left.score);
    } catch (error) {
      logger.warn(`Failed to parse favicon html for ${target.origin}`, error);
      return [];
    }
  }

  private async fetchCandidate(candidate: IconCandidate): Promise<ResolvedIcon> {
    try {
      return {
        buffer: await this.fetchAndNormalizeIcon(candidate.url),
        source: candidate.source
      };
    } catch (error) {
      logger.warn(`Failed favicon candidate ${candidate.url}`, error);
      throw error;
    }
  }

  private async fetchAndNormalizeIcon(iconUrl: string): Promise<Buffer> {
    const imageBuffer = await requestBuffer(iconUrl);
    if (imageBuffer.length === 0) {
      throw new Error('Empty favicon response');
    }

    return sharp(imageBuffer)
      .resize(64, 64, {
        fit: 'contain',
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0
        }
      })
      .png()
      .toBuffer();
  }

  private async createLetterIcon(letter: string, backgroundColor: string): Promise<Buffer> {
    const svg = `
      <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="16" fill="${backgroundColor}" />
        <text x="32" y="39" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">${escapeSvgText(letter)}</text>
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private async getCachePath(target: URL): Promise<string> {
    const hash = createHash('sha1')
      .update(`${CACHE_KEY_VERSION}:${target.origin}`)
      .digest('hex')
      .slice(0, 12);
    const safeHost = target.hostname.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
    return join(getFaviconCachePath(), `${safeHost}-${hash}.png`);
  }
}

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('URL is required');
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const buildFallbackLetter = (target: URL): string =>
  target.hostname.replace(/^www\./, '').slice(0, 1).toUpperCase() || '?';

const buildFallbackColor = (hostname: string): string => {
  const index = hostname.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

const bufferToDataUrl = (buffer: Buffer): string =>
  `data:image/png;base64,${buffer.toString('base64')}`;

const parseIconCandidates = (html: string, baseUrl: URL): IconCandidate[] => {
  const candidates: IconCandidate[] = [];
  const linkPattern = /<link\b[^>]*>/gi;
  const links = html.match(linkPattern) ?? [];

  for (const link of links) {
    const rel = readAttribute(link, 'rel')?.toLowerCase() ?? '';
    if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/.test(rel)) {
      continue;
    }

    const href = readAttribute(link, 'href');
    if (!href) {
      continue;
    }

    try {
      const sizes = readAttribute(link, 'sizes');
      const score = parseSizeScore(sizes) + (rel.includes('apple-touch-icon') ? 8 : 0);
      candidates.push({
        url: new URL(href, baseUrl).toString(),
        source: 'html',
        score
      });
    } catch {
      continue;
    }
  }

  return candidates;
};

const readAttribute = (tag: string, name: string): string | null => {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
};

const parseSizeScore = (sizes: string | null): number => {
  if (!sizes || sizes.toLowerCase() === 'any') {
    return 64;
  }

  const scores = [...sizes.matchAll(/(\d+)\s*x\s*(\d+)/gi)].map((match) =>
    Math.min(Number(match[1]), Number(match[2]))
  );

  return scores.length > 0 ? Math.max(...scores) : 32;
};

const dedupeCandidates = (candidates: IconCandidate[]): IconCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) {
      return false;
    }

    seen.add(candidate.url);
    return true;
  });
};

const requestText = async (url: string): Promise<string> => {
  const buffer = await requestBuffer(url);
  return buffer.toString('utf8');
};

const requestBuffer = (url: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url
    });
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      request.abort();
      reject(new Error(`Request timeout for ${url}`));
    }, REQUEST_TIMEOUT_MS);

    request.setHeader('user-agent', USER_AGENT);
    request.on('response', (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        clearTimeout(timeout);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        response.resume();
        return;
      }

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
    });
    request.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    request.end();
  });

const escapeSvgText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
