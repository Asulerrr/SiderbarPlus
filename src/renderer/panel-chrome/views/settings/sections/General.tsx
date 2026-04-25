import type { AppConfig } from '@shared/types';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function General({ config: _config, updateConfig: _updateConfig }: Props): JSX.Element {
  return <div>General (stub)</div>;
}
