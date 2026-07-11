import type { PanelDescriptor } from '../../shared/types';

export const SHARED_PARTITION = 'persist:shared';

export const resolvePanelPartition = (descriptor: PanelDescriptor): string => {
  const web = descriptor.web;
  if (!web) return SHARED_PARTITION;

  if (web.sessionGroup === '__isolated__' || web.isolatedSession) {
    return `persist:panel-${descriptor.id}`;
  }
  if (web.sessionGroup) {
    return `persist:group-${web.sessionGroup}`;
  }

  return SHARED_PARTITION;
};
