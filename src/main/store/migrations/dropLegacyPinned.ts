import type { AppConfig } from '../../../shared/types';

export const dropLegacyPinned = (config: AppConfig): AppConfig => {
  const layout = config.layout as AppConfig['layout'] & { pinned?: boolean };
  if (!('pinned' in layout)) {
    return config;
  }
  const { pinned: _discard, ...rest } = layout;
  return { ...config, layout: rest };
};
