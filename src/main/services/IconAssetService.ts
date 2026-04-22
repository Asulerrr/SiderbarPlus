import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { IconSource, PanelDescriptor } from '../../shared/types';

const DIRECT_URL_PATTERN = /^(https?:|data:|file:)/i;
const WINDOWS_LOCAL_PATH_PATTERN = /^[A-Za-z]:[\\/]/;

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const isLocalIconPath = (iconPath?: string): iconPath is string => {
  if (!iconPath) {
    return false;
  }

  if (DIRECT_URL_PATTERN.test(iconPath)) {
    return false;
  }

  return WINDOWS_LOCAL_PATH_PATTERN.test(iconPath) || iconPath.startsWith('/');
};

const buildIconMimeType = (iconPath: string): string =>
  MIME_TYPE_BY_EXTENSION[extname(iconPath).toLowerCase()] ?? 'application/octet-stream';

export const readIconPathAsDataUrl = async (iconPath: string): Promise<string> => {
  const buffer = await readFile(iconPath);
  return `data:${buildIconMimeType(iconPath)};base64,${buffer.toString('base64')}`;
};

export const hydrateIconSourceForRenderer = async (iconSource: IconSource): Promise<IconSource> => {
  if (!isLocalIconPath(iconSource.path)) {
    return iconSource;
  }

  try {
    return {
      ...iconSource,
      dataUrl: await readIconPathAsDataUrl(iconSource.path)
    };
  } catch {
    return iconSource;
  }
};

export const hydratePanelsForRenderer = async (
  panels: PanelDescriptor[]
): Promise<PanelDescriptor[]> =>
  Promise.all(
    panels.map(async (panel) => ({
      ...panel,
      iconSource: await hydrateIconSourceForRenderer(panel.iconSource)
    }))
  );
