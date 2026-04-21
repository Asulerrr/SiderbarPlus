import log from 'electron-log/main';

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024;

export const logger = log;
