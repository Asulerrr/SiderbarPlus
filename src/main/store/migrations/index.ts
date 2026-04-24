import type { AppConfig } from '../../../shared/types';
import { dropLegacyPinned } from './dropLegacyPinned';

export const migrateConfig = async (config: AppConfig): Promise<AppConfig> => {
  return dropLegacyPinned(config);
};
