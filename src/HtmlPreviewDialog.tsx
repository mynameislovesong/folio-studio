import {useEffect, useMemo, useRef, useState} from 'react';
import {Copy, Download, Expand, Layers, Minus, Plus} from 'lucide-react';
import {compileHtml} from './code';
import {Modal} from './Modal';
import type {DialogNotice} from './Modal';
import {NumberField, Toggle} from './Inspector';
import {previewDocument, previewSizeLimits} from './htmlImport';
import type {ImportedHtml} from './htmlImport';
import {clamp, makeLayer} from './model';
import type {Layer, Project} from './model';
import {download} from './storage';

export function HtmlPreviewDialog({imported, close, restore, apply}: {
  imported: ImportedHtml; close: () => void; restore: (project: Project) => void; apply: (layer: Layer) => void;
}) {
  const [mode, setMode] = useState<'design' | 'code'>('design');
  const [size, setSize] = useState(imported.size);
  const [zoom, setZoom] = useState<number>();
  const [checker, setChecker] = useState(true);
  const [external, setExternal] = useState(false);
  const [notice, setNotice] = useState<DialogNotice>();
  const [available, setAvailable] = useState({width: 0, height: 0});
  const viewport = useRef<HTMLDivElement>(null);
  const code = useRef<HTMLTextAreaElement>(null);
  const srcDoc = useMemo(() => {
    try {return previewDocument(imported, external);} catch {return undefined;}
  }, [imported, external]);
  const fit = available.width && available.height
    ? Math.min(1, (available.width - 24) / size.width, (available.height - 24) / size.height) : 0.1;
  const scale = zoom ?? Math.max(0.01, fit);
  const {min, max} = previewSizeLimits;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setAvailable({width: element.clientWidth, height: element.clientHeight});
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [mode]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(imported.source);
      setNotice({message: '원본 코드를 복사했습니다.'});
    } catch {
      code.current?.focus();
      code.current?.select();
      setNotice({message: '자동 복사가 차단됐습니다. 선택된 원본 코드를 복사하세요.', error: true});
    }
  }

  function applyHtml() {
    try {
      compileHtml(imported.source, '', {}, 'import-check');
    } catch {
      setNotice({message: '이 파일의 HTML/CSS를 레이어에 적용할 수 없습니다. 코드 보기에서 원본을 확인하세요.', error: true});
      return;
    }
    const name = imported.file.name.replace(/\.html?$/i, '').trim().slice(0, 100) || '가져온 HTML';
    apply(makeLayer('html', {name, html: imported.source, w: size.width, h: size.height}));
  }

  return <Modal title="HTML 파일 미리보기" subtitle={imported.file.name} wide close={close} notice={notice}>
    <div className="html-viewer">
      <div className="html-viewer-toolbar">
        <div className="segmented" aria-label="HTML 보기 모드">
          <button className={mode === 'design' ? 'chosen' : ''} aria-pressed={mode === 'design'} onClick={() => setMode('design')}>디자인 보기</button>
          <button className={mode === 'code' ? 'chosen' : ''} aria-pressed={mode === 'code'} onClick={() => setMode('code')}>코드 보기</button>
        </div>
        {mode === 'design' && <div className="zoom-tools">
          <button className="button subtle" onClick={() => {setZoom(undefined); viewport.current?.scrollTo(0, 0);}}><Expand />화면 맞춤</button>
          <button className="button subtle" onClick={() => setZoom(1)}>100%</button>
          <button className="icon-button" aria-label="미리보기 축소" title="축소" onClick={() => setZoom(clamp(scale / 1.25, 0.01, 4))}><Minus /></button>
          <output className="html-zoom-value">{Math.round(scale * 100)}%</output>
          <button className="icon-button" aria-label="미리보기 확대" title="확대" onClick={() => setZoom(clamp(scale * 1.25, 0.01, 4))}><Plus /></button>
        </div>}
      </div>
      {mode === 'design' ? <>
        <div className="html-viewport-settings">
          <NumberField label="미리보기 너비" value={size.width} min={min} max={max} set={width => setSize(previous => ({...previous, width: Math.round(width)}))} />
          <NumberField label="미리보기 높이" value={size.height} min={min} max={max} set={height => setSize(previous => ({...previous, height: Math.round(height)}))} />
          <Toggle label="체크무늬 배경" value={checker} set={setChecker} />
        </div>
        {!imported.inferred && <p className="muted">고정 크기를 찾지 못해 1700 × 800 px로 시작합니다. 위에서 너비와 높이를 조정할 수 있습니다.</p>}
        {srcDoc === undefined ? <div className="error-box" role="alert">디자인을 렌더링할 수 없습니다. 원본 코드 보기와 다운로드를 사용할 수 있습니다.</div> : <div className="html-viewer-viewport" ref={viewport}>
          <div className="html-viewer-stage">
            <div className={'html-frame-slot' + (checker ? ' checker' : '')} style={{width: size.width * scale, height: size.height * scale}}>
              <iframe title="가져온 HTML 디자인" sandbox="" inert tabIndex={-1} referrerPolicy="no-referrer" srcDoc={srcDoc}
                style={{width: size.width, height: size.height, transform: 'scale(' + scale + ')'}} />
            </div>
          </div>
        </div>}
        <Toggle label="외부 HTTPS 이미지·글꼴·스타일 허용" value={external} set={setExternal} />
        <p className="muted">스크립트와 링크 이동은 차단됩니다. 외부 리소스는 기본 차단되며, 허용해도 오프라인에서는 표시되지 않을 수 있습니다. 별도 로컬 파일은 HTML에 포함해야 표시됩니다.</p>
      </> : <textarea className="code-input html-source" readOnly spellCheck={false} aria-label="HTML 원본 코드" value={imported.source} ref={code} />}
      {imported.invalidProject && <p className="muted">내장 프로젝트 데이터가 유효하지 않아 원본 HTML 미리보기로 열었습니다.</p>}
      {imported.project && <p className="muted">Folio Studio 프로젝트 데이터가 있습니다. 복원하면 현재 작업과 별도의 새 편집 프로젝트로 열립니다.</p>}
      <p className="muted">적용하면 현재 프로젝트에 HTML 레이어 1개가 추가됩니다. 레이어에는 편집기가 지원하는 HTML/CSS만 반영됩니다.</p>
    </div>
    <footer className="modal-footer">
      <button className="button subtle" onClick={() => download(imported.file, imported.file.name)}><Download />HTML 다운로드</button>
      {mode === 'code' && <button className="button subtle" onClick={copy}><Copy />코드 복사</button>}
      {imported.project && <button className="button subtle" onClick={() => restore(imported.project!)}>편집 프로젝트로 복원</button>}
      <div className="spacer" />
      <button className="button primary" onClick={applyHtml}><Layers />적용</button>
    </footer>
  </Modal>;
}
