import { getFromWindow } from '@/ts/utils';

export const config: IConfig = JSON.parse(JSON.stringify(getFromWindow('vnoConfig')));

export const baseFiles = [
  config.paths.index,
  config.paths.readme,
  config.paths.archive,
  config.paths.category,
  config.paths.search,
  config.paths.common,
];
