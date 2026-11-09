import {defaultTreeAdapter, parse, parseFragment, serialize} from 'parse5';
import type {DefaultTreeAdapterTypes as Html} from 'parse5';
import postcss from 'postcss';
import {canvasSizeLimits, htmlImportLimit, htmlViewportLimits, kinds, readProject, safeRaster} from './model';
import type {FieldType, Kind, Project} from './model';
import type {EditableField} from './code';

const defaultSize = {width: 1700, height: 800};
const projectMarker = 'folio-studio-project';
const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const blockedTags = new Set(['script', 'base', 'iframe', 'frame', 'frameset', 'object', 'embed', 'portal', 'fencedframe']);
const dimensionNames = ['width', 'height', 'aspect-ratio'] as const;
type Dimension = typeof dimensionNames[number];
type Size = {width: number; height: number};
const isElement = (node: Html.ChildNode): node is Html.Element => 'tagName' in node;
const children = (node: Html.ParentNode) => node.childNodes.filter(isElement);
const attr = (node: Html.Element, name: string) => node.attrs.find(value => value.name === name)?.value;
const content = (node: Html.Element) => node.childNodes.map(child => 'value' in child ? child.value : '').join('');

export interface ImportedHtml {
  file: File;
  source: string;
  document: Html.Document;
  size: Size;
  inferred: boolean;
  project?: Project;
  invalidProject: boolean;
}

function readEmbeddedProject(source: string) {
  const value = JSON.parse(source);
  const validSize = (size: unknown) => typeof size === 'number' && Number.isInteger(size)
    && size >= canvasSizeLimits.min && size <= canvasSizeLimits.max;
  if (!value || typeof value.name !== 'string' || !validSize(value.width) || !validSize(value.height)
    || !Array.isArray(value.layers) || value.layers.length > 500 || !value.layers.every((layer: Record<string, unknown>) =>
      layer && kinds.includes(layer.kind as Kind) && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(layer[key]))
      && Number(layer.w) > 0 && Number(layer.h) > 0
      && (layer.kind !== 'image' || (typeof layer.src === 'string' && safeRaster(layer.src))))) {
    throw new Error('지원하지 않는 프로젝트 데이터입니다.');
  }
  return readProject(value);
}

function safePreviewTree(parent: Html.ParentNode, styles: string[], projects: string[]) {
  parent.childNodes = parent.childNodes.filter(node => {
    if (!isElement(node)) return true;
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' && attr(node, 'id') === projectMarker
      && attr(node, 'type')?.trim().toLowerCase() === 'application/json') projects.push(content(node));
    if (blockedTags.has(tag) || (tag === 'meta' && (attr(node, 'http-equiv') !== undefined
      || attr(node, 'name')?.trim().toLowerCase() === 'referrer'))) return false;
    if (tag === 'link' && attr(node, 'rel')?.trim().toLowerCase() !== 'stylesheet') return false;
    if (tag === 'style') styles.push(content(node));
    node.attrs = node.attrs.filter(attribute => attribute.name !== 'referrerpolicy'
      && (!(tag === 'a' || tag === 'area') || !['href', 'ping'].includes(attribute.name)));
    safePreviewTree(node, styles, projects);
    if (tag === 'template') safePreviewTree(defaultTreeAdapter.getTemplateContent(node as Html.Template), [], []);
    return true;
  });
}

function pixelValue(value?: string) {
  return value && /^\d*\.?\d+px$/i.test(value) ? parseFloat(value) : undefined;
}

function validPreviewSize(width?: number, height?: number) {
  const {min, max} = htmlViewportLimits;
  return width && height && width >= min && width <= max && height >= min && height <= max
    ? {width: Math.round(width), height: Math.round(height)} : undefined;
}

function inferSize(root: Html.Element, styles: string[]): Size | undefined {
  const body = children(root).find(node => node.tagName === 'body');
  if (!body) return;
  // Build only a detached selector tree. No URLs, markup, or CSS are mounted in the editor document.
  const probe = document.implementation.createHTMLDocument();
  function append(parent: Element, node: Html.Element) {
    const element = probe.createElementNS(node.namespaceURI, node.tagName);
    for (const key of ['id', 'class', 'data-artboard']) {
      const value = attr(node, key);
      if (value !== undefined) element.setAttribute(key, value);
    }
    parent.append(element);
    return element;
  }
  const rootElement = probe.documentElement;
  rootElement.id = attr(root, 'id') ?? '';
  rootElement.className = attr(root, 'class') ?? '';
  probe.body.remove();
  const bodyElement = append(rootElement, body);
  const top = children(body).filter(node => !['style', 'link', 'meta', 'template'].includes(node.tagName));
  const wrappers = top.map(node => ({node, element: append(bodyElement, node)}));
  const candidates = [{node: root, element: rootElement}, {node: body, element: bodyElement},
    ...wrappers.filter(({element}) => wrappers.length === 1 || element.matches('[data-artboard]') ||
      /(?:^|[\s_-])(artboard|canvas|stage)(?:$|[\s_-])/i.test((element.getAttribute('id') ?? '') + ' ' + (element.getAttribute('class') ?? '')))];
  const dimensions = candidates.map(() => new Map<Dimension, {value: string; important: boolean}>());
  function put(index: number, key: Dimension, value: string, important: boolean) {
    const fields = dimensions[index];
    if (important || !fields.get(key)?.important) fields.set(key, {value: value.trim(), important});
  }
  for (const style of styles) {
    try {
      for (const rule of postcss.parse(style).nodes) {
        if (rule.type !== 'rule') continue;
        candidates.forEach(({element}, index) => {
          try {if (!element.matches(rule.selector)) return;} catch {return;}
          rule.walkDecls(declaration => {
            if (declaration.parent === rule && dimensionNames.includes(declaration.prop.toLowerCase() as Dimension)) {
              put(index, declaration.prop.toLowerCase() as Dimension, declaration.value, !!declaration.important);
            }
          });
        });
      }
    } catch { /* The iframe still renders CSS that the browser can recover. */ }
  }
  const inline = probe.createElement('div').style;
  for (const [index, {node}] of candidates.entries()) {
    inline.cssText = attr(node, 'style') ?? '';
    for (const key of dimensionNames) {
      const value = inline.getPropertyValue(key);
      if (value) put(index, key, value, inline.getPropertyPriority(key) === 'important');
    }
    const values = dimensions[index];
    const width = pixelValue(values.get('width')?.value) ?? (['svg', 'canvas'].includes(node.tagName) ? Number(attr(node, 'width')) : undefined);
    const height = pixelValue(values.get('height')?.value) ?? (['svg', 'canvas'].includes(node.tagName) ? Number(attr(node, 'height')) : undefined);
    const [numerator, denominator = 1] = (values.get('aspect-ratio')?.value ?? '').split('/').map(Number);
    const ratio = numerator > 0 && denominator > 0 ? numerator / denominator : 0;
    const size = validPreviewSize(width || (height && ratio ? height * ratio : undefined),
      height || (width && ratio ? width / ratio : undefined));
    if (size) return size;
  }
}

export async function loadHtmlFile(file: File): Promise<ImportedHtml> {
  if (!/\.html?$/i.test(file.name)) throw new Error('.html 또는 .htm 파일을 선택하세요.');
  if (file.size > htmlImportLimit) throw new Error('20MB 이하의 HTML 파일을 선택하세요.');
  let source: string;
  try {
    source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await file.arrayBuffer());
  } catch {
    throw new Error('파일을 읽을 수 없습니다. UTF-8로 저장한 HTML 파일을 선택하세요.');
  }
  if (!/<(?:!doctype\s+html\b|[a-z][\w:-]*(?:\s|\/?>))/i.test(source)) throw new Error('표시할 HTML 마크업을 찾을 수 없습니다.');
  const {parsed, root, styles, projects} = prepareDocument(source);
  let project: Project | undefined;
  if (projects.length === 1) {
    try {project = readEmbeddedProject(projects[0]);} catch { /* Fall back to the original HTML viewer. */ }
  }
  const size = inferSize(root, styles) ?? (project && validPreviewSize(project.width, project.height));
  return {file, source, document: parsed, size: size ?? defaultSize, inferred: !!size, project, invalidProject: projects.length > 0 && !project};
}

function prepareDocument(source: string) {
  const parsed = parse(source.replace(/^\uFEFF/, ''), {scriptingEnabled: false});
  const root = children(parsed).find(node => node.namespaceURI === htmlNamespace && node.tagName === 'html')!;
  const styles: string[] = [];
  const projects: string[] = [];
  safePreviewTree(parsed, styles, projects);
  return {parsed, root, styles, projects};
}

function setAttribute(node: Html.Element, name: string, value: string) {
  const existing = node.attrs.find(attribute => attribute.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({name, value});
}

export function prepareHtmlLayer(source: string, css: string, values: Record<string, string>) {
  const {parsed, root} = prepareDocument(source);
  if (css.trim()) {
    const head = children(root).find(node => node.tagName === 'head')!;
    const style = parseFragment('<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>').childNodes[0];
    defaultTreeAdapter.appendChild(head, style);
  }
  const fields: EditableField[] = [];
  const used = new Set<string>();
  const style = document.createElement('div').style;
  function visit(parent: Html.ParentNode) {
    for (const node of children(parent)) {
      const type = attr(node, 'data-editable');
      if ((type === 'text' || type === 'background' || (type === 'image' && node.tagName === 'img'))
        && !['html', 'head', 'body', 'style'].includes(node.tagName)) {
        const named = attr(node, 'id')?.trim();
        const number = fields.length + 1;
        let id = named && named.length <= 120 ? named : 'field-' + number;
        if (used.has(id)) id += '-' + number;
        while (used.has(id)) id += '-';
        used.add(id);
        style.cssText = attr(node, 'style') ?? '';
        const override = Object.hasOwn(values, id) ? values[id] : undefined;
        const value = type === 'text' ? content(node) : type === 'image' ? attr(node, 'src') ?? '' : style.backgroundColor;
        fields.push({id, type: type as FieldType, label: attr(node, 'data-label') || named || id, value: override ?? value});
        if (override !== undefined) {
          if (type === 'text') {
            node.childNodes = [];
            defaultTreeAdapter.insertText(node, override);
          } else if (type === 'image') {
            if (safeRaster(override)) setAttribute(node, 'src', override);
            else node.attrs = node.attrs.filter(attribute => attribute.name !== 'src');
          } else if (safeRaster(override) || /^#[\da-f]{6}$/i.test(override)) {
            style.backgroundImage = safeRaster(override) ? 'url("' + override + '")' : 'none';
            if (safeRaster(override)) {
              style.backgroundSize = 'cover';
              style.backgroundPosition = 'center';
            } else style.backgroundColor = override;
            setAttribute(node, 'style', style.cssText);
          }
        }
      }
      visit(node);
    }
  }
  visit(root);
  return {document: parsed, fields};
}

export function previewDocument(document: Html.Document, external: boolean) {
  const root = children(document).find(node => node.tagName === 'html')!;
  const head = children(root).find(node => node.tagName === 'head')!;
  const resources = external ? 'data: https:' : 'data:';
  const policy = "default-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline' "
    + resources + '; img-src ' + resources + '; font-src ' + resources + '; media-src data:';
  const security = parseFragment('<meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="referrer" content="no-referrer">');
  const originalHead = head.childNodes;
  head.childNodes = [...security.childNodes, ...originalHead];
  try {return serialize(document, {scriptingEnabled: false});} finally {head.childNodes = originalHead;}
}
