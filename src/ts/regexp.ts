export function getWrapRegExp(left: string, right = left, flags?: string) {
  return new RegExp(`${left}\\s*(.+?)\\s*${right}`, flags);
}

export function getHeadingPattern(min: number, max: number) {
  return ` {0,3}(#{${min},${max}})`;
}

export function getHeadingRegExp(min = 1, max = 6, flags?: string) {
  return new RegExp(`^${getHeadingPattern(min, max)}(?: \\s*(.+?))?$`, flags);
}

export function getLinkPathPattern(startWithSlash: boolean) {
  return `\\(\\s*(${startWithSlash ? '/' : ''}.*?)(?:\\s+["'].*?["'])?\\s*\\)`;
}

export function getLinkRegExp(startWithSlash = false, isImg = false, isLine = false, flags?: string) {
  let pattern = `\\[(.*?)]${getLinkPathPattern(startWithSlash)}`;
  if (isImg) {
    pattern = `!${pattern}`;
  }
  if (isLine) {
    pattern = `^${pattern}$`;
  }
  return new RegExp(pattern, flags);
}

export function getAnchorRegExp(isLine = true, min = 2, max = 6, flags?: string) {
  let pattern = `h[${min}-${max}]-\\d+`;
  if (isLine) {
    pattern = `^${pattern}$`;
  }
  return new RegExp(pattern, flags);
}
