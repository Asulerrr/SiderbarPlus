import type { AppConfig } from '../../../shared/types';
import { dropLegacyPinned } from './dropLegacyPinned';
import { migrateIsolatedToSessionGroup } from './migrateIsolatedToSessionGroup';

export const migrateConfig = async (config: AppConfig): Promise<AppConfig> => {
  return migrateIsolatedToSessionGroup(dropLegacyPinned(config));
};
