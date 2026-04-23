export interface ConfigPersistPaths {
  configPath: string;
  backupPath: string;
  tempPath: string;
}

export interface ConfigPersistPlan {
  writeTempTo: string;
  replaceTarget: string;
  copyBackupFrom: string;
  copyBackupTo: string;
}

export const buildConfigPersistPlan = ({
  configPath,
  backupPath,
  tempPath
}: ConfigPersistPaths): ConfigPersistPlan => ({
  writeTempTo: tempPath,
  replaceTarget: configPath,
  copyBackupFrom: configPath,
  copyBackupTo: backupPath
});
