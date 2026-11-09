import {useMemo} from 'react';
import type {CSSProperties} from 'react';
import {compileHtml, fontCss, iframeDocument, svgUrl} from './code';
import {safeRaster} from './model';
import {prepareHtmlLayer, previewDocument} from './htmlImport';
import {htmlDocumentImage} from './htmlDocumentImage';
import type {FontAsset, Layer, Project} from './model';

export function position(layer: Layer): CSSProperties {
  return {position: 'absolute', left: layer.x, top: layer.y, width: layer.w, height: layer.h, transform: 'rotate(' + layer.rotation + 'deg)'};
}

export function textStyle(layer: Layer): CSSProperties {
  return {
    width: '100%', height: '100%', margin: 0, boxSizing: 'border-box', color: layer.color,
    fontFamily: layer.font, fontSize: layer.fontSize, fontWeight: layer.weight, letterSpacing: layer.tracking,
    lineHeight: layer.leading, textAlign: layer.align, writingMode: layer.vertical ? 'vertical-rl' : 'horizontal-tb',
    textShadow: layer.shadow ? '2px 3px 7px #0009' : 'none', whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere', overflow: 'hidden',
  };
}

export function CodeContent({layer, fonts, exportMode = false}: {layer: Layer; fonts: FontAsset[]; exportMode?: boolean}) {
  const scope = 'code-' + layer.id;
  const result = useMemo(() => {
    try {
      return compileHtml(layer.html, layer.css, layer.fields, scope);
    } catch {
      return null;
    }
  }, [layer.html, layer.css, layer.fields, scope]);

  if (!result) return exportMode ? null : <div className="code-error">코드 오류 · 코드 편집에서 수정하세요</div>;
  if (exportMode) return <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden'}}>
    <style>{result.css}</style>
    <div id={scope} style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', boxSizing: 'border-box'}} dangerouslySetInnerHTML={{__html: result.markup}} />
  </div>;
  return <iframe title={layer.name + ' 미리보기'} sandbox="" srcDoc={iframeDocument(result, scope, fonts)}
    style={{display: 'block', width: '100%', height: '100%', border: 0, pointerEvents: 'none', colorScheme: 'normal', background: 'transparent'}} />;
}

function HtmlDocumentLayer({layer, viewport, exportMode}: {
  layer: Layer; viewport: NonNullable<Layer['htmlViewport']>; exportMode: boolean;
}) {
  const {width, height, external} = viewport;
  const src = useMemo(() => {
    try {
      const document = prepareHtmlLayer(layer.html, layer.css, layer.fields).document;
      return exportMode ? htmlDocumentImage(document, width, height) : previewDocument(document, external);
    } catch (cause) {
      if (exportMode) throw new Error('‘' + layer.name + '’ HTML 레이어의 PNG용 문서를 만들 수 없습니다.', {cause});
      return null;
    }
  }, [layer.html, layer.css, layer.fields, width, height, external, exportMode, layer.name]);
  if (!src) return <div className="code-error">HTML 문서를 표시할 수 없습니다.</div>;
  const style: CSSProperties = {
    display: 'block', width, height, border: 0, transformOrigin: 'top left',
    transform: 'scale(' + layer.w / width + ',' + layer.h / height + ')',
    pointerEvents: 'none', colorScheme: 'normal', background: 'transparent',
  };
  return <div style={{width: '100%', height: '100%', overflow: 'hidden'}}>
    {exportMode ? <img src={src} alt="" style={style} /> : <iframe title={layer.name + ' 미리보기'}
      sandbox="" inert tabIndex={-1} referrerPolicy="no-referrer" srcDoc={src} style={style} />}
  </div>;
}

function Artwork({layer, fonts, exportMode}: {layer: Layer; fonts: FontAsset[]; exportMode: boolean}) {
  const vector = useMemo(() => svgUrl(layer.svg), [layer.svg]);
  if (layer.kind === 'html' && layer.htmlViewport) return <HtmlDocumentLayer layer={layer} viewport={layer.htmlViewport} exportMode={exportMode} />;
  if (layer.kind === 'html') return <CodeContent layer={layer} fonts={fonts} exportMode={exportMode} />;
  if (layer.kind === 'text') return <div style={textStyle(layer)}>{layer.text}</div>;
  if (layer.kind === 'image') {
    const filters = [
      'blur(' + layer.blur + 'px)', 'brightness(' + layer.brightness + '%)', 'contrast(' + layer.contrast + '%)',
      'saturate(' + layer.saturation + '%)', 'grayscale(' + layer.grayscale + '%)', 'sepia(' + layer.sepia + '%)',
    ].join(' ');
    return safeRaster(layer.src) && <img src={layer.src} alt="" draggable={false} style={{
      display: 'block', width: '100%', height: '100%', objectFit: layer.fit, objectPosition: layer.cropX + '% ' + layer.cropY + '%',
      transformOrigin: layer.cropX + '% ' + layer.cropY + '%',
      transform: 'scale(' + (layer.cropZoom / 100 * (layer.flipX ? -1 : 1)) + ', ' + (layer.cropZoom / 100 * (layer.flipY ? -1 : 1)) + ')',
      filter: filters,
    }} />;
  }
  if (layer.kind === 'svg' || layer.kind === 'frame') {
    const src = vector;
    if (!src) return null;
    if (layer.tint) return <div style={{width: '100%', height: '100%', background: layer.color, mask: 'url("' + src + '") center / 100% 100% no-repeat'}} />;
    return <img src={src} alt="" draggable={false} style={{display: 'block', width: '100%', height: '100%', objectFit: 'fill'}} />;
  }
  return <div style={{
    width: '100%', height: '100%', boxSizing: 'border-box', background: layer.color,
    border: layer.strokeWidth ? layer.strokeWidth + 'px solid ' + layer.stroke : undefined,
    borderRadius: layer.kind === 'circle' ? '50%' : layer.radius,
  }} />;
}

function ArtLayer({layer, fonts, exportMode}: {layer: Layer; fonts: FontAsset[]; exportMode: boolean}) {
  const mask = useMemo(() => svgUrl(layer.mask, layer.maskMode === 'clip'), [layer.mask, layer.maskMode]);
  return <div style={{
    ...position(layer), opacity: layer.opacity / 100, mixBlendMode: layer.blend,
    filter: layer.shadow && layer.kind !== 'text' ? 'drop-shadow(4px 8px 12px #0008)' : undefined,
    pointerEvents: 'none',
  }}>
    <div style={{
      width: '100%', height: '100%', overflow: layer.kind === 'image' ? 'hidden' : undefined,
      borderRadius: layer.kind === 'image' ? layer.radius : undefined,
      maskImage: mask ? 'url("' + mask + '")' : undefined,
      maskPosition: 'center',
      maskSize: '100% 100%',
      maskRepeat: 'no-repeat',
      maskMode: layer.maskMode === 'luminance' ? 'luminance' : 'alpha',
    }}>
      <Artwork layer={layer} fonts={fonts} exportMode={exportMode} />
    </div>
  </div>;
}

export function Artboard({project, exportMode = false, omit}: {project: Project; exportMode?: boolean; omit?: string}) {
  const fontStyle = useMemo(() => fontCss(project.fonts), [project.fonts]);
  return <div style={{
    position: 'relative', width: project.width, height: project.height, overflow: 'hidden', isolation: 'isolate',
    backgroundColor: project.transparent ? 'transparent' : project.background,
    backgroundImage: safeRaster(project.backgroundImage) ? 'url("' + project.backgroundImage + '")' : undefined,
    backgroundPosition: 'center', backgroundSize: 'cover',
  }}>
    {fontStyle && <style>{fontStyle}</style>}
    {project.layers.toReversed().map(layer => layer.visible && layer.id !== omit && <ArtLayer key={layer.id} layer={layer} fonts={project.fonts} exportMode={exportMode} />)}
  </div>;
}

