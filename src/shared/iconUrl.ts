const DIRECT_URL_PATTERN = /^(https?:|data:|file:)/i;
const WINDOWS_DRIVE_PREFIX_PATTERN = /^[A-Za-z]:\//;

const encodePathSegments = (normalizedPath: string): string =>
  normalizedPath
    .split('/')
    .map((segment, index) => {
      if (!segment) {
        return segment;
      }

      if (index === 0 && /^[A-Za-z]:$/.test(segment)) {
        return segment;
      }

      return encodeURIComponent(segment);
    })
    .join('/');

export const toRenderableIconUrl = (iconPath: string): string => {
  if (DIRECT_URL_PATTERN.test(iconPath)) {
    return iconPath;
  }

  const normalizedPath = iconPath.replace(/\\/g, '/').trim();
  if (!normalizedPath) {
    return normalizedPath;
  }

  const encodedPath = encodePathSegments(normalizedPath);
  if (WINDOWS_DRIVE_PREFIX_PATTERN.test(normalizedPath)) {
    return `file:///${encodedPath}`;
  }

  if (normalizedPath.startsWith('/')) {
    return `file://${encodedPath}`;
  }

  return encodedPath;
};
