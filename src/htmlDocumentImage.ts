import type {DefaultTreeAdapterTypes as Html} from 'parse5';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const svgNamespace = 'http://www.w3.org/2000/svg';
const rootMarker = 'data-folio-export-document';
const xmlName = /^[\p{L}_][\p{L}\p{N}_.:\p{M}-]*$/u;

function imageCss(css: string) {
  if (!css.includes(':root')) return css;
  try {
    const stylesheet = postcss.parse(css);
    stylesheet.walkRules(rule => {
      if (!rule.selector.includes(':root')) return;
      rule.selector = selectorParser(selectors => selectors.walkPseudos(pseudo => {
        if (pseudo.value === ':root') pseudo.replaceWith(selectorParser.attribute({
          attribute: rootMarker, value: undefined, raws: {},
        }));
      })).processSync(rule.selector);
    });
    return stylesheet.toString();
  } catch {
    // Keep browser CSS error recovery when the source is not valid for PostCSS.
    return css;
  }
}

export function htmlDocumentImage(source: Html.Document, width: number, height: number) {
  const snapshot = document.implementation.createDocument(svgNamespace, 'svg', null);
  const svg = snapshot.documentElement;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const foreignObject = snapshot.createElementNS(svgNamespace, 'foreignObject');
  foreignObject.setAttribute('width', '100%');
  foreignObject.setAttribute('height', '100%');
  svg.append(foreignObject);
  const root = source.childNodes.find((node): node is Html.Element => 'tagName' in node && node.tagName === 'html');
  if (!root) throw new Error('내보낼 HTML 문서를 찾을 수 없습니다.');

  function append(parent: Element, node: Html.ChildNode) {
    if (node.nodeName === '#text' && 'value' in node) {
      parent.append(snapshot.createTextNode(parent.localName === 'style' ? imageCss(node.value) : node.value));
    }
    if (!('tagName' in node) || !xmlName.test(node.tagName)) return;
    const element = snapshot.createElementNS(node.namespaceURI, node.tagName);
    for (const {name, namespace, prefix, value} of node.attrs) {
      if (!xmlName.test(name) || name === 'xmlns' || name.startsWith('on')) continue;
      element.setAttributeNS(namespace ?? null, prefix ? prefix + ':' + name : name, value);
    }
    if (node === root) element.setAttribute(rootMarker, '');
    parent.append(element);
    for (const child of node.childNodes) append(element, child);
  }
  append(foreignObject, root);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
