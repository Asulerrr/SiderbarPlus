export type BuiltinWidgetId = 'add-site' | 'edit-site' | 'site-info' | 'settings';

export interface BuiltinPanelRoute {
  widgetId: BuiltinWidgetId;
  targetPanelId?: string;
}

const TARGETED_WIDGETS = new Set<BuiltinWidgetId>(['edit-site', 'site-info']);

export const buildBuiltinPanelId = (
  widgetId: BuiltinWidgetId,
  targetPanelId?: string
): string => {
  if (TARGETED_WIDGETS.has(widgetId)) {
    if (!targetPanelId) {
      throw new Error(`Builtin widget ${widgetId} requires a target panel id.`);
    }

    return `builtin:${widgetId}:${targetPanelId}`;
  }

  return `builtin:${widgetId}`;
};

export const parseBuiltinPanelId = (panelId: string): BuiltinPanelRoute | null => {
  const match = panelId.match(/^builtin:(add-site|edit-site|site-info|settings)(?::(.+))?$/);
  if (!match) {
    return null;
  }

  const widgetId = match[1] as BuiltinWidgetId;
  const targetPanelId = match[2];
  if (TARGETED_WIDGETS.has(widgetId)) {
    if (!targetPanelId) {
      return null;
    }

    return {
      widgetId,
      targetPanelId
    };
  }

  return {
    widgetId
  };
};
