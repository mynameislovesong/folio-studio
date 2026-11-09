import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {Artboard} from './Artboard';
import type {Project} from './model';

const svgImageUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

async function checkHtmlSnapshotSupport() {
  const wrap = (html: string) => '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><foreignObject width="1" height="1">'
    + html + '</foreignObject></svg>';
  const inner = svgImageUrl(wrap('<div xmlns="http://www.w3.org/1999/xhtml" style="width:1px;height:1px;background:red"/>'));
  const image = new Image();
  image.src = svgImageUrl(wrap('<img xmlns="http://www.w3.org/1999/xhtml" style="display:block;width:1px;height:1px" src="' + inner + '"/>'));
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(image, 0, 0);
      if (ctx.getImageData(0, 0, 1, 1).data[3] === 255) return;
    }
  } catch { /* Some browsers disallow drawing nested HTML in SVG images. */ }
  throw new Error('이 브라우저는 원본 HTML 레이어의 PNG 합성을 지원하지 않습니다. Chrome 또는 Edge에서 다시 시도하세요.');
}

export async function exportPng(project: Project, scale: 1 | 2 | 4) {
  const width = project.width * scale;
  const height = project.height * scale;
  if (width * height > 64_000_000 || width > 16384 || height > 16384) {
    throw new Error('출력 크기가 브라우저에서 안전하게 처리할 수 있는 범위(6,400만 픽셀)를 초과합니다. 배율 또는 캔버스 크기를 줄이세요.');
  }
  if (project.layers.some(layer => layer.visible && layer.kind === 'html' && layer.htmlViewport)) await checkHtmlSnapshotSupport();
  // Leave the preview dialog's effect before synchronously rendering the snapshot.
  await Promise.resolve();
  const host = document.createElement('div');
  let renderError: unknown;
  const root = createRoot(host, {onUncaughtError: error => {renderError = error;}});
  let content: string;
  try {
    flushSync(() => root.render(<Artboard project={project} exportMode />));
    if (renderError) throw renderError;
    if (!host.firstElementChild) throw new Error('캔버스를 렌더링하지 못했습니다.');
    content = new XMLSerializer().serializeToString(host.firstElementChild);
  } finally {
    root.unmount();
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + project.width + ' ' + project.height + '"><foreignObject width="100%" height="100%">' + content + '</foreignObject></svg>';
  const image = new Image();
  image.src = svgImageUrl(svg);
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D 캔버스를 초기화할 수 없습니다.');
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error('PNG를 인코딩할 수 없습니다.')), 'image/png'));
  } catch (error) {
    throw new Error('이 브라우저에서 PNG를 렌더링하지 못했습니다. 지원되는 로컬 이미지·폰트인지 확인하거나 배율을 낮춰 다시 시도하세요.', {cause: error});
  }
}

