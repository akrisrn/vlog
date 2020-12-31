import { baseFiles, config } from '@/ts/config';
import { EFlag } from '@/ts/enums';
import { addBaseUrl, checkLinkPath, shortenPath } from '@/ts/path';
import { importMarkdownTs } from '@/ts/async';
import { formatDate } from '@/ts/async/date';
import { getHeadingRegExp, getLinkRegExp, getWrapRegExp } from '@/ts/async/regexp';
import { addCacheKey, isExternalLink, trimList } from '@/ts/async/utils';
import axios from 'axios';

export function createErrorFile(path: string): TFile {
  return {
    path,
    data: config.messages.pageError,
    flags: {
      title: shortenPath(path),
    },
    links: {},
    isError: true,
  };
}

const cachedBacklinks: Dict<string[]> = {};

let markdownTs: TMarkdownTs | null = null;

async function getLinks(path: string, data: string) {
  if (!markdownTs) {
    markdownTs = await importMarkdownTs();
  }
  const links: Dict<TLink> = {};
  for (const token of markdownTs.parseMD(markdownTs.replaceInlineScript(path, data))) {
    if (token.type !== 'inline') {
      continue;
    }
    for (const child of token.children || []) {
      if (!['link_open', 'image'].includes(child.type)) {
        continue;
      }
      let href = '';
      let mdHref = '';
      let isImage = false;
      if (child.type === 'link_open') {
        href = child.attrGet('href') || '';
        if (href.startsWith('/')) {
          mdHref = checkLinkPath(href);
        }
      } else {
        href = child.attrGet('src') || '';
        isImage = true;
      }
      if (!href || mdHref && mdHref === path) {
        continue;
      }
      const key = mdHref || href;
      if (links[key] !== undefined) {
        continue;
      }
      const isMarkdown = !!mdHref;
      links[key] = {
        href: key,
        isExternal: isMarkdown ? false : isExternalLink(href),
        isMarkdown,
        isImage,
      };
      if (!isMarkdown) {
        continue;
      }
      let backlinks = cachedBacklinks[mdHref];
      if (backlinks === undefined) {
        backlinks = [path];
        cachedBacklinks[mdHref] = backlinks;
      } else if (!backlinks.includes(path)) {
        backlinks.push(path);
      }
    }
  }
  return links;
}

async function parseData(path: string, data: string): Promise<TFile> {
  const flags: IFlags = { title: shortenPath(path) };
  if (!data) {
    return { path, data, flags, links: {} };
  }
  const flagRegExp = getWrapRegExp(`^@(\\S+?):`, '$');
  const titleRegExp = getHeadingRegExp(1, 1);
  data = data.split('\n').map(line => {
    line = line.trimEnd();
    const flagMatch = line.match(flagRegExp);
    if (flagMatch) {
      const [, flagMark, flagText] = flagMatch;
      if ([EFlag.tags, EFlag.updated].includes(flagMark as EFlag)) {
        flags[flagMark] = trimList(flagText.split(/[,，、]/)).sort();
      } else {
        flags[flagMark] = flagText;
      }
      return '';
    }
    const titleMatch = line.match(titleRegExp);
    if (titleMatch) {
      if (titleMatch[2]) {
        flags.title = titleMatch[2];
      }
      return '';
    }
    return line;
  }).join('\n').trim();
  if (flags.tags && flags.tags.length > 0) {
    flags.tags = flags.tags.map(tag => trimList(tag.split('/'), false).join('/')).sort();
  }
  let cover = flags.cover;
  if (cover) {
    const imageMatch = cover.match(getLinkRegExp(false, true, true));
    if (imageMatch) {
      cover = imageMatch[2];
    }
    if (!isExternalLink(cover)) {
      cover = addBaseUrl(cover);
    }
    flags.cover = cover;
  }
  const dateList = flags.updated ? [...flags.updated] : [];
  const dateMatch = path.match(/\/(\d{4}[/-]\d{2}[/-]\d{2})[/-]/);
  if (dateMatch) {
    dateList.push(dateMatch[1]);
  }
  if (dateList.length > 0) {
    const times = Array.from(new Set(dateList.map(date => {
      return date.match(/^[0-9]+$/) ? parseInt(date) : new Date(date).getTime();
    }).filter(time => !isNaN(time)))).sort();
    const length = times.length;
    if (length > 0) {
      flags.times = times;
      if (length === 1) {
        flags.startDate = flags.endDate = formatDate(new Date(times[0]));
      } else {
        flags.startDate = formatDate(new Date(times[0]));
        flags.endDate = formatDate(new Date(times[length - 1]));
      }
    }
  }
  return { path, data, flags, links: await getLinks(path, data) };
}

let noCache = false;

export function isCached() {
  return !noCache;
}

// noinspection JSUnusedGlobalSymbols
export function disableCache() {
  noCache = true;
}

// noinspection JSUnusedGlobalSymbols
export function enableCache() {
  noCache = false;
}

const isRequesting: Dict<boolean> = {};
const cachedFiles: Dict<TFile> = {};

export async function getFile(path: string) {
  while (isRequesting[path]) {
    await new Promise(_ => setTimeout(_, 100));
  }
  isRequesting[path] = true;
  if (!noCache && cachedFiles[path] !== undefined) {
    isRequesting[path] = false;
    return cachedFiles[path];
  }
  return new Promise<TFile>(resolve => {
    axios.get<string>(addBaseUrl(addCacheKey(path, false))).then(async response => {
      cachedFiles[path] = await parseData(path, response.data.trim());
    }).catch(() => {
      cachedFiles[path] = createErrorFile(path);
    }).finally(() => {
      isRequesting[path] = false;
      resolve(cachedFiles[path]);
    });
  });
}

const walkedPaths = [...baseFiles];

async function walkFiles(files: TFile[]) {
  const paths: string[] = [];
  for (const file of files) {
    if (file.isError) {
      continue;
    }
    for (const link of Object.values(file.links)) {
      if (!link.isMarkdown) {
        continue;
      }
      const path = link.href;
      if (paths.includes(path) || cachedFiles[path] !== undefined && walkedPaths.includes(path)) {
        continue;
      }
      paths.push(path);
      walkedPaths.push(path);
    }
  }
  if (paths.length > 0) {
    await walkFiles(await Promise.all(paths.map(path => getFile(path))));
  }
}

let isCacheCompleted = false;

export async function getFiles() {
  if (noCache || !isCacheCompleted) {
    await walkFiles(await Promise.all(baseFiles.map(path => getFile(path))));
    isCacheCompleted = true;
  }
  return { files: cachedFiles, backlinks: cachedBacklinks };
}

export { sortFiles } from '@/ts/async/compare';
