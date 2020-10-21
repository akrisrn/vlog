import resource from '@/ts/resource';
import { getWrapRegExp, isHashMode } from '@/ts/utils';
import { AxiosError } from 'axios';
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token';

const footnote = require('markdown-it-footnote');
const deflist = require('markdown-it-deflist');
const taskLists = require('markdown-it-task-lists');
const container = require('markdown-it-container');

// noinspection JSUnusedGlobalSymbols
const markdownIt = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
}).use(footnote).use(deflist).use(taskLists).use(container, 'details', {
  validate: (params: string) => {
    return params.trim().match(/^(open\s+)?(?:\.(.*?)\s+)?(.*)$/);
  },
  render: (tokens: Token[], idx: number) => {
    const token = tokens[idx];
    if (token.nesting === 1) {
      const match = token.info.trim().match(/^(open\s+)?(?:\.(.*?)\s+)?(.*)$/)!;
      let open = '';
      if (match[1]) {
        open = ' open';
      }
      let classAttr = '';
      if (match[2]) {
        classAttr = ` class="${match[2].split('.').join(' ')}"`;
      }
      const summary = markdownIt.render(match[3]).trim().replace(/^<p>(.*)<\/p>$/, '$1');
      return `<details${classAttr}${open}><summary>${summary}</summary>`;
    }
    return '</details>';
  },
});
markdownIt.linkify.tlds([], false);

const getDefaultRenderRule = (name: string) => {
  return markdownIt.renderer.rules[name] || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
};

const defaultImageRenderRule = getDefaultRenderRule('image');
markdownIt.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  let src = token.attrGet('src')!;
  const match = src.match(/#(.+)$/);
  if (match) {
    const width = parseInt(match[1], 0);
    if (isNaN(width)) {
      if (match[1].startsWith('.')) {
        match[1].substr(1).split('.').forEach((cls) => {
          cls = cls.trim();
          token.attrJoin('class', cls);
        });
      } else {
        token.attrSet('style', match[1]);
      }
    } else {
      token.attrSet('width', width.toString());
    }
    src = src.replace(/#.+$/, '');
    token.attrSet('src', src);
  }
  return defaultImageRenderRule(tokens, idx, options, env, self);
};

const defaultFenceRenderRule = getDefaultRenderRule('fence');
markdownIt.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.tag === 'code') {
    token.attrJoin('class', 'line-numbers');
  }
  return defaultFenceRenderRule(tokens, idx, options, env, self);
};

const defaultTheadRenderRule = getDefaultRenderRule('thead_open');
markdownIt.renderer.rules.thead_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  let isEmpty = true;
  let i = idx + 2;
  do {
    const thToken = tokens[i];
    if (thToken.type === 'inline' && thToken.content) {
      isEmpty = false;
      break;
    }
    i += 1;
  } while (tokens[i].type !== 'tr_close');
  if (isEmpty) {
    token.attrJoin('class', 'hidden');
  }
  return defaultTheadRenderRule(tokens, idx, options, env, self);
};

const defaultHtmlBlockRenderRule = getDefaultRenderRule('html_block');
markdownIt.renderer.rules.html_block = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.content.startsWith('<div id="toc">')) {
    const div = document.createElement('div');
    div.innerHTML = token.content;
    const uls = div.querySelectorAll<HTMLUListElement>('#toc > ul');
    if (uls.length === 2) {
      uls[0].classList.add('ul-a');
      uls[1].classList.add('ul-b');
    }
    div.querySelectorAll<HTMLLinkElement>('#toc a').forEach((a) => {
      a.setAttribute('h', a.getAttribute('href')!);
      a.removeAttribute('href');
    });
    div.querySelectorAll<HTMLLinkElement>('#toc > ul.tags > li > a').forEach((a) => {
      const count = a.querySelector<HTMLSpanElement>('span.count');
      if (count) {
        a.removeChild(count);
        a.parentElement!.append(count);
        const fontSize = Math.log10(parseInt(count.innerText.substr(1), 0)) + 1;
        if (fontSize > 1) {
          a.style.fontSize = fontSize + 'em';
        }
      }
    });
    token.content = div.innerHTML;
  }
  return defaultHtmlBlockRenderRule(tokens, idx, options, env, self);
};

const defaultHeadingRenderRule = getDefaultRenderRule('heading_close');
markdownIt.renderer.rules.heading_close = (tokens, idx, options, env, self) => {
  const link = document.createElement('a');
  link.classList.add('heading-link');
  link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 16 16"><path fill-rule="evenodd" d="M4 9h1v1H4c-1.5 0-3-1.69-3-3.5S2.55 3 4 3h4c1.45 0 3 1.69 3 3.5 0 1.41-.91 2.72-2 3.25V8.59c.58-.45 1-1.27 1-2.09C10 5.22 8.98 4 8 4H4c-.98 0-2 1.22-2 2.5S3 9 4 9zm9-3h-1v1h1c1 0 2 1.22 2 2.5S13.98 12 13 12H9c-.98 0-2-1.22-2-2.5 0-.83.42-1.64 1-2.09V6.25c-1.09.53-2 1.84-2 3.25C6 11.31 7.55 13 9 13h4c1.45 0 3-1.69 3-3.5S14.5 6 13 6z"></path></svg>';
  return link.outerHTML + defaultHeadingRenderRule(tokens, idx, options, env, self);
};

const defaultFootnoteRenderRule = getDefaultRenderRule('footnote_anchor');
markdownIt.renderer.rules.footnote_anchor = (tokens, idx, options, env, self) => {
  return defaultFootnoteRenderRule(tokens, idx, options, env, self).replace(/\shref=".*?"/, '');
};

const defaultLinkRenderRule = getDefaultRenderRule('link_open');
markdownIt.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet('href')!;
  if (href.startsWith('http')) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
    tokens[idx + 2].attrSet('external', 'true');
  }
  return defaultLinkRenderRule(tokens, idx, options, env, self);
};

const defaultLinkCloseRenderRule = getDefaultRenderRule('link_close');
markdownIt.renderer.rules.link_close = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  let svg = '';
  if (token.attrGet('external')) {
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 12 16"><path fill-rule="evenodd" d="M11 10h1v3c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V3c0-.55.45-1 1-1h3v1H1v10h10v-3zM6 2l2.25 2.25L5 7.5 6.5 9l3.25-3.25L12 8V2H6z"></path></svg>';
  }
  return svg + defaultLinkCloseRenderRule(tokens, idx, options, env, self);
};

export function renderMD(data: string, isCategory: boolean, noToc = false) {
  let article: HTMLElement;
  const toc: string[] = [];
  let firstHeader = '';
  data = data.split('\n').map((line) => {
    if (!noToc) {
      const tocMatch = line.match(getWrapRegExp('^(##+)', '$'));
      if (tocMatch) {
        if (!firstHeader) {
          firstHeader = tocMatch[1];
        }
        let prefix = '-';
        if (tocMatch[1] !== firstHeader) {
          prefix = tocMatch[1].replace(new RegExp(`${firstHeader}$`), '-').replace(/#/g, '  ');
        }
        toc.push(`${prefix} [${tocMatch[2]}](h${tocMatch[1].length})`);
      }
    }
    // 将被 $ 包围的部分作为 JavaScript 表达式执行
    const regexp = getWrapRegExp('\\$', '\\$', 'g');
    const lineCopy = line;
    let jsExpMatch = regexp.exec(lineCopy);
    while (jsExpMatch) {
      let result: string;
      try {
        if (!article) {
          article = document.createElement('article');
          article.innerHTML = markdownIt.render(data);
        }
        result = eval(`(function(article,isHashMode){${jsExpMatch[1]}})`)(article, isHashMode());
      } catch (e) {
        result = `${e.name}: ${e.message}`;
      }
      line = line.replace(jsExpMatch[0], result);
      jsExpMatch = regexp.exec(lineCopy);
    }
    return line;
  }).join('\n');
  if (!noToc) {
    let tocHtml = '<div id="toc">';
    if (toc.length > 7 && !isCategory) {
      let mid = Math.ceil(toc.length / 2);
      while (toc[mid] && !toc[mid].startsWith('-')) {
        mid += 1;
      }
      tocHtml += markdownIt.render(toc.slice(0, mid).join('\n')) +
        markdownIt.render(toc.slice(mid, toc.length).join('\n'));
    } else {
      tocHtml += markdownIt.render(toc.join('\n'));
    }
    tocHtml += '</div>';
    tocHtml = tocHtml.replace(/<ul>/g, `<ul class="toc${isCategory ? ' tags' : ''}">`);
    data = data.replace(/\[toc]/i, tocHtml);
  }
  return markdownIt.render(data);
}

export function error2markdown(error: AxiosError) {
  return `# ${error.response!.status} ${error.response!.statusText}\n${resource.pageError}`;
}
