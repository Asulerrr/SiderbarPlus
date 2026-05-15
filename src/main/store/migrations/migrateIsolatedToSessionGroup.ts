import type { AppConfig, WebPanelConfig } from '../../../shared/types';

export const migrateIsolatedToSessionGroup = (config: AppConfig): AppConfig => {
  const needsMigration = config.panels.some(
    (panel) => panel.web?.isolatedSession && !panel.web?.sessionGroup
  );
  if (!needsMigration) return config;

  return {
    ...config,
    panels: config.panels.map((panel) => {
      if (!panel.web?.isolatedSession || panel.web?.sessionGroup) return panel;
      const { isolatedSession: _, ...restWeb } = panel.web as WebPanelConfig & { isolatedSession?: boolean };
      return {
        ...panel,
        web: { ...restWeb, sessionGroup: '__isolated__' }
      };
    })
  };
};
