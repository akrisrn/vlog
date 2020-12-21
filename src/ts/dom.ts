import { EIcon } from '@/ts/enums';
import { checkLinkPath, getSearchTagLinks, shortenPath } from '@/ts/path';
import { importFileTs } from '@/ts/async';

export let eventListenerDict: Dict<{ elements: Element[]; listeners: EventListenerOrEventListenerObject[] }> = {};

export function cleanEventListenerDict() {
  eventListenerDict = {};
}

export function removeClass(element: Element, cls?: string) {
  if (cls) {
    element.classList.remove(cls);
  }
  if (element.classList.length === 0) {
    element.removeAttribute('class');
  }
}

const html = document.documentElement;
html.style.scrollBehavior = 'smooth';

export function scroll(height: number, isSmooth = true) {
  html.style.scrollBehavior = !isSmooth ? 'auto' : 'smooth';
  setTimeout(() => scrollTo(0, height), 0);
}

// noinspection JSSuspiciousNameCombination
export function getIcon(type: EIcon, width = 16, height = width) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${width}" height="${height}"><path fill-rule="evenodd" d="${type}"></path></svg>`;
}

function createBar(flags: IFlags) {
  const bar = document.createElement('div');
  bar.classList.add('bar');
  flags.tags && flags.tags.forEach(tag => {
    const itemTag = document.createElement('code');
    itemTag.classList.add('item-tag');
    getSearchTagLinks(tag).forEach(link => {
      const a = document.createElement('a');
      a.href = link[0];
      a.innerText = link[1];
      itemTag.append(a);
    });
    bar.append(itemTag);
  });
  if (flags.startDate) {
    const itemDate = document.createElement('code');
    itemDate.classList.add('item-date');
    itemDate.innerText = flags.startDate;
    bar.append(itemDate);
  }
  if (bar.childElementCount > 0) {
    const filler = document.createElement('span');
    filler.classList.add('filler');
    return [filler, bar];
  } else {
    return null;
  }
}

export function createList(file: TFile, li?: HTMLLIElement) {
  const flags = file.flags;
  if (!li) {
    li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${shortenPath(file.path)}`;
    a.innerText = flags.title;
    li.append(a);
  }
  li.classList.add('article');
  if (file.isError) {
    return li;
  }
  const bar = createBar(flags);
  if (bar) {
    li.append(bar[0]);
    li.append(bar[1]);
  }
  return li;
}

export async function simpleUpdateLinkPath(callback?: (file: TFile, a: HTMLAnchorElement) => void) {
  const dict: Dict<HTMLAnchorElement[]> = {};
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="#/"]')) {
    if (a.innerText !== '') {
      continue;
    }
    a.innerText = '#';
    const path = checkLinkPath(a.getAttribute('href')!.substr(1));
    if (!path) {
      continue;
    }
    a.classList.add('rendering');
    const links = dict[path];
    if (links !== undefined) {
      links.push(a);
      continue;
    }
    dict[path] = [a];
  }
  const paths = Object.keys(dict);
  if (paths.length === 0) {
    return;
  }
  const files = await Promise.all(paths.map(async path => (await importFileTs()).getFile(path)));
  files.forEach(file => {
    for (const a of dict[file.path]) {
      if (file.isError) {
        a.classList.add('error');
      }
      a.innerText = file.flags.title;
      if (callback) {
        callback(file, a);
      }
      removeClass(a, 'rendering');
    }
  });
}
