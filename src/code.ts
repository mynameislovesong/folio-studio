import DOMPurify from 'dompurify';
import {parse, parseFragment, serialize} from 'parse5';
import type {DefaultTreeAdapterTypes, ParserErrorHandler} from 'parse5';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import {safeFont, safeRaster} from './model';
import type {FieldType, FontAsset} from './model';

const htmlNS = 'http://www.w3.org/1999/xhtml';
const svgNS = 'http://www.w3.org/2000/svg';
const svgId = /^#[a-z_][\w:.-]*$/i;
const blockedAttrs = ['srcset', 'ping', 'action', 'formaction', 'background', 'poster', 'target', 'contenteditable', 'autofocus', 'download', 'is', 'nonce', 'integrity'];
const blockedTags = ['style', 'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'base', 'meta', 'link', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'source', 'track', 'canvas', 'foreignobject', 'animate', 'animatetransform', 'animatemotion', 'set', 'discard'];
const cssFunctions = /(?:image-set|cross-fade|image|paint|src|expression|element)\s*\(/i;

function safeValue(value: string) {
  if (/[\\<>]/.test(value) || /\/\*/.test(value) || cssFunctions.test(value)) return false;
  const urls = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)"']+))\s*\)/gi;
  for (const match of value.matchAll(urls)) {
    const url = match[1] ?? match[2] ?? match[3];
    if (!safeRaster(url) && !svgId.test(url)) return false;
  }
  return !/url\s*\(/i.test(value.replace(urls, ''));
}

function safeCss(source: string, scope?: string) {
  const root = postcss.parse(source);
  root.walkComments(comment => { comment.remove(); });
  root.walkAtRules(rule => { rule.remove(); });
  root.walkDecls(declaration => {
    if (!safeValue(declaration.value) || /[^a-z0-9-]/i.test(declaration.prop)) declaration.remove();
    else delete declaration.raws.value;
  });
  root.walkRules(rule => {
    if (rule.parent?.type !== 'root' || /[<>\\]/.test(rule.selector)) {
      rule.remove();
      return;
    }
    delete rule.raws.selector;
    if (!scope) return;
    rule.selector = selectorParser(selectors => {
      selectors.each(selector => {
        const nodes = [...selector.nodes];
        let rootSelected = false;
        for (const node of nodes) {
          if ((node.type === 'tag' && /^(html|body)$/i.test(node.value)) || (node.type === 'pseudo' && node.value === ':root')) {
            if (rootSelected) {
              if (node.prev()?.type === 'combinator') node.prev()?.remove();
              node.remove();
            } else {
              node.replaceWith(selectorParser.id({value: scope}));
              rootSelected = true;
            }
          } else if (node.type === 'combinator' && rootSelected && node.value.trim()) break;
        }
        if (!rootSelected) {
          selector.prepend(selectorParser.combinator({value: ' '}));
          selector.prepend(selectorParser.id({value: scope}));
        }
      });
    }).processSync(rule.selector);
  });
  return root.toString().replace(/</g, '\\3c ');
}

function inlineStyle(value: string) {
  const node = document.createElement('div');
  node.style.cssText = value;
  for (const key of Array.from(node.style)) {
    if (!safeValue(node.style.getPropertyValue(key))) node.style.removeProperty(key);
  }
  return node.style.cssText;
}

function sanitized(source: string, svgOnly = false) {
  const fragment = DOMPurify.sanitize(source, {
    USE_PROFILES: {html: !svgOnly, svg: true, svgFilters: true},
    FORBID_TAGS: blockedTags,
    FORBID_ATTR: blockedAttrs,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const node of fragment.querySelectorAll('*')) {
    for (const attr of Array.from(node.attributes)) {
      const key = attr.localName.toLowerCase();
      const value = attr.value.trim();
      if (key === 'style') {
        const filtered = inlineStyle(value);
        if (filtered) node.setAttribute('style', filtered);
        else node.removeAttributeNode(attr);
      } else if (key === 'href' || key === 'src') {
        const rasterTarget = ['img', 'image', 'feimage'].includes(node.localName.toLowerCase());
        if (!(node.namespaceURI === svgNS && svgId.test(value)) && !(rasterTarget && safeRaster(value))) node.removeAttributeNode(attr);
      } else if (/url\s*\(|[\\<>]/i.test(value) && !['data-editable', 'id', 'aria-label', 'alt', 'class', 'title'].includes(key) && !safeValue(value)) {
        node.removeAttributeNode(attr);
      }
    }
  }
  return fragment;
}

export function checkSvg(source: string) {
  const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  if (root.localName !== 'svg' || (root.namespaceURI && root.namespaceURI !== svgNS) || root.querySelector('parsererror')) {
    throw new Error('올바른 SVG 코드가 필요합니다. 태그와 속성 따옴표를 확인하세요.');
  }
  return root;
}

export function cleanSvg(source: string, silhouette = false) {
  const parsed = checkSvg(source);
  if (!parsed.hasAttribute('xmlns')) parsed.setAttribute('xmlns', svgNS);
  const svg = sanitized(new XMLSerializer().serializeToString(parsed), true).firstElementChild;
  if (!svg || svg.localName !== 'svg') throw new Error('SVG 요소를 찾을 수 없습니다.');
  svg.setAttribute('xmlns', svgNS);
  const css = safeCss(Array.from(parsed.querySelectorAll('style'), tag => tag.textContent ?? '').join('\n'));
  if (css) {
    const style = document.createElementNS(svgNS, 'style');
    style.textContent = css;
    svg.prepend(style);
  }
  if (silhouette) {
    const clip = svg.querySelector('clipPath');
    if (clip) {
      if (clip.getAttribute('clipPathUnits') === 'objectBoundingBox') svg.setAttribute('viewBox', '0 0 1 1');
      const shape = document.createElementNS(svgNS, 'g');
      if (clip.hasAttribute('transform')) shape.setAttribute('transform', clip.getAttribute('transform')!);
      for (const child of clip.children) shape.append(child.cloneNode(true));
      svg.append(shape);
    }
    svg.setAttribute('preserveAspectRatio', 'none');
  }
  return new XMLSerializer().serializeToString(svg);
}

export function svgUrl(source: string, silhouette = false) {
  if (!source.trim()) return '';
  try {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cleanSvg(source, silhouette)).replace(/'/g, '%27');
  } catch {
    return '';
  }
}

export function svgSize(source: string) {
  const svg = checkSvg(source);
  const viewBox = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const width = parseFloat(svg.getAttribute('width') ?? '') || viewBox[2] || 240;
  const height = parseFloat(svg.getAttribute('height') ?? '') || viewBox[3] || 160;
  return {width: Math.max(1, width), height: Math.max(1, height)};
}

export interface EditableField {id: string; type: FieldType; label: string; value: string}
function extractHtml(source: string) {
  const full = /<!doctype|<html[\s>]|<body[\s>]/i.test(source);
  const warnings: string[] = [];
  const onParseError: ParserErrorHandler = error => {
    if (error.code !== 'missing-doctype' && warnings.length < 4) {
      warnings.push('HTML ' + error.startLine + '행 ' + error.startCol + '열 · ' + error.code);
    }
  };
  const tpl = document.createElement('template');
  tpl.innerHTML = source;
  const styles = Array.from(tpl.content.querySelectorAll('style'), tag => tag.textContent ?? '');
  let content: DefaultTreeAdapterTypes.ParentNode;
  if (full) {
    const document = parse(source, {onParseError});
    const isElement = (node: DefaultTreeAdapterTypes.ChildNode): node is DefaultTreeAdapterTypes.Element => 'tagName' in node;
    const html = document.childNodes.filter(isElement).find(node => node.tagName === 'html');
    content = html?.childNodes.filter(isElement).find(node => node.tagName === 'body') ?? document;
  } else {
    content = parseFragment(source, {onParseError});
  }
  return {markup: serialize(content), styles: styles.join('\n'), warnings};
}

export function compileHtml(source: string, stylesheet: string, values: Record<string, string>, scope: string) {
  const {markup, styles, warnings} = extractHtml(source);
  const root = sanitized(markup);
  const fields: EditableField[] = [];
  const used = new Set<string>();
  root.querySelectorAll('[data-editable]').forEach((node, index) => {
    const type = node.getAttribute('data-editable');
    if (type !== 'text' && type !== 'image' && type !== 'background') return;
    if (type === 'image' && node.localName !== 'img') {
      warnings.push('image 편집 영역은 <img> 태그에 지정하세요.');
      return;
    }
    const named = node.getAttribute('id')?.trim();
    let id = named && named.length <= 120 ? named : 'field-' + (index + 1);
    if (used.has(id)) {
      warnings.push('중복 ID를 가진 편집 영역에 고유 ID를 지정했습니다.');
      id = id + '-' + (index + 1);
    }
    while (used.has(id)) id += '-';
    used.add(id);
    node.setAttribute('id', id);
    const html = node.namespaceURI === htmlNS ? node as HTMLElement : null;
    const original = type === 'text' ? node.textContent ?? '' : type === 'image' ? node.getAttribute('src') ?? '' : html?.style.backgroundColor ?? '';
    const overridden = Object.hasOwn(values, id) ? values[id] : undefined;
    if (overridden !== undefined) {
      if (type === 'text') node.textContent = overridden;
      if (type === 'image') {
        if (safeRaster(overridden)) node.setAttribute('src', overridden);
        else node.removeAttribute('src');
      }
      if (type === 'background' && html) {
        if (safeRaster(overridden)) {
          html.style.backgroundImage = 'url("' + overridden + '")';
          html.style.backgroundSize = 'cover';
          html.style.backgroundPosition = 'center';
        } else if (/^#[\da-f]{6}$/i.test(overridden)) {
          html.style.backgroundImage = 'none';
          html.style.backgroundColor = overridden;
        }
      }
    }
    fields.push({id, type, label: node.getAttribute('data-label') || named || id, value: overridden ?? original});
  });
  const output = document.createElement('div');
  output.append(root);
  return {markup: output.innerHTML, css: safeCss(styles + '\n' + stylesheet, scope), fields, warnings};
}

export function fontCss(fonts: FontAsset[]) {
  return fonts.filter(font => safeFont(font.src) && /^Folio-[a-f0-9-]+$/i.test(font.family))
    .map(font => '@font-face{font-family:"' + font.family + '";src:url("' + font.src + '");font-display:swap}').join('');
}

export function iframeDocument(compiled: ReturnType<typeof compileHtml>, scope: string, fonts: FontAsset[]) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; base-uri \'none\'; form-action \'none\'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;color-scheme:normal;background:transparent}#' + scope + '{position:relative;width:100%;height:100%;overflow:hidden;box-sizing:border-box}' + fontCss(fonts) + compiled.css + '</style></head><body><div id="' + scope + '">' + compiled.markup + '</div></body></html>';
}
