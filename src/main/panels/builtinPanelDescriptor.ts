import {
  BUILTIN_ADD_SITE_ID,
  BUILTIN_SETTINGS_ID
} from '../../shared/constants';
import { parseBuiltinPanelId } from '../../shared/builtinPanels';
import type { PanelDescriptor } from '../../shared/types';

export const createBuiltinPanelDescriptor = (
  panelId: string,
  preferredWidth?: number
): PanelDescriptor | null => {
  const route = parseBuiltinPanelId(panelId);
  if (!route) return null;

  const definitions = {
    'add-site': { id: BUILTIN_ADD_SITE_ID, title: '添加网页', letter: '+', color: '#375a7f' },
    'edit-site': { id: panelId, title: '编辑此站点', letter: 'E', color: '#5f4b8b' },
    'site-info': { id: panelId, title: '站点信息', letter: 'I', color: '#3f6f62' },
    settings: { id: BUILTIN_SETTINGS_ID, title: '设置', letter: '⚙', color: '#3a3a3a' }
  } as const;
  const definition = definitions[route.widgetId];

  return {
    id: definition.id,
    type: 'builtin',
    title: definition.title,
    iconSource: {
      kind: 'letter',
      fallbackLetter: definition.letter,
      fallbackColor: definition.color
    },
    order: -1,
    preferredWidth,
    builtin: {
      widgetId: route.widgetId,
      targetPanelId: route.targetPanelId
    }
  };
};
