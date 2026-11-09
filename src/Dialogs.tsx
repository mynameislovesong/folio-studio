import {useEffect, useRef, useState} from 'react';
import {AlertCircle, BookOpen, CodeXml, Download, FileImage, FolderOpen, Plus, Save, Trash2, Upload, Copy} from 'lucide-react';
import {Artboard} from './Artboard';
import {checkSvg, cleanSvg, compileHtml, svgSize} from './code';
import {defaultCss, defaultHtml, makeLayer, newProject} from './model';
import type {Layer, LayerPatch, Project} from './model';
import {download} from './storage';
import type {SavedProject, SavedTemplate} from './storage';
import {exportPng} from './export';
import {templateGuide} from './templateGuide';

import {Modal} from './Modal';
import type {DialogNotice} from './Modal';
import {loadHtmlFile} from './htmlImport';
import type {ImportedHtml} from './htmlImport';
import {HtmlPreviewDialog} from './HtmlPreviewDialog';

function TemplateGuideDialog({close}: {close: () => void}) {
  const guide = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState<DialogNotice>();

  async function copyGuide() {
    try {
      await navigator.clipboard.writeText(templateGuide);
      setFeedback({message: '지침 전체를 복사했습니다.'});
    } catch {
      guide.current?.focus();
      guide.current?.select();
      setFeedback({message: '자동 복사가 차단됐습니다. 선택된 지침을 Ctrl+C 또는 Cmd+C로 복사하세요.', error: true});
    }
  }

  return <Modal title="캐릭터 소개 HTML 명함 제작 공통 지침" wide close={close} notice={feedback}>
    <textarea className="guide-text" ref={guide} value={templateGuide} readOnly aria-label="제작 지침 전문" />
    <footer className="modal-footer">
      <div className="spacer" />
      <button className="button primary" onClick={copyGuide}><Copy />전체 복사</button>
    </footer>
  </Modal>;
}

export type CodeTab = 'html' | 'css' | 'svg' | 'mask';
export type CodeTarget = {mode: 'template' | 'add-html' | 'add-svg'} | {mode: 'edit'; layer: Layer; tab: CodeTab};
const demoMask = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#fff"/></svg>';
const tabLabels: Record<CodeTab, string> = {html: 'HTML', css: 'CSS', svg: 'SVG', mask: 'SVG 마스크'};

export function CodeDialog({project, target, close, apply, save, notice, restore}: {
  project: Project;
  target: CodeTarget;
  close: () => void;
  apply: (layers: Layer[], patch: LayerPatch) => void;
  save: (name: string, layers: Layer[]) => void;
  notice?: DialogNotice;
  restore: (project: Project) => void;
}) {
  const existing = target.mode === 'edit' ? target.layer : undefined;
  const initialTab = target.mode === 'edit' ? target.tab : target.mode === 'add-svg' ? 'svg' : 'html';
  const isMask = initialTab === 'mask';
  const tabs: CodeTab[] = target.mode === 'template' ? ['html', 'css', 'svg'] : isMask ? ['mask'] : initialTab === 'svg' ? ['svg'] : ['html', 'css'];
  const [tab, setTab] = useState<CodeTab>(initialTab);
  const [showGuide, setShowGuide] = useState(false);
  const [htmlFile, setHtmlFile] = useState<ImportedHtml>();
  const [htmlError, setHtmlError] = useState('');
  const [readingHtml, setReadingHtml] = useState(false);
  const htmlInput = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState({
    html: existing?.html ?? (target.mode === 'add-html' ? defaultHtml : ''),
    css: existing?.css ?? (target.mode === 'add-html' ? defaultCss : ''),
    svg: existing?.svg ?? '',
    mask: existing?.mask ?? '',
  });
  const [maskMode, setMaskMode] = useState(existing?.maskMode ?? 'alpha');
  const [name, setName] = useState(existing?.name ?? (target.mode === 'template' ? '가져온 템플릿' : target.mode === 'add-svg' ? 'SVG' : 'HTML'));
  const [fileError, setFileError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dimension = existing ? {width: existing.w, height: existing.h} : target.mode === 'add-html' ? {width: 400, height: 260} : {width: project.width, height: project.height};
  let width = dimension.width;
  let height = dimension.height;
  let layers: Layer[] = [];
  let patch: LayerPatch = {};
  let error = '';
  let warnings: string[] = [];
  let fields = 0;
  try {
    if (isMask && existing) {
      if (sources.mask.trim()) cleanSvg(sources.mask, maskMode === 'clip');
      patch = {mask: sources.mask, maskMode};
      layers = [{...existing, ...patch, x: 0, y: 0, rotation: 0, visible: true}];
    } else if (initialTab === 'svg' && existing) {
      cleanSvg(sources.svg);
      patch = {svg: sources.svg};
      layers = [{...existing, ...patch, x: 0, y: 0, rotation: 0, visible: true}];
    } else if (existing) {
      const result = compileHtml(sources.html, sources.css, existing.fields, 'draft-template');
      fields = result.fields.length;
      warnings = result.warnings;
      patch = {html: sources.html, css: sources.css};
      layers = [{...existing, ...patch, x: 0, y: 0, rotation: 0, visible: true}];
    } else {
      if (sources.svg.trim() && tabs.includes('svg')) {
        cleanSvg(sources.svg);
        if (target.mode === 'add-svg') {
          const natural = svgSize(sources.svg);
          const fit = Math.min(1, project.width * .66 / natural.width, project.height * .66 / natural.height);
          width = Math.max(1, natural.width * fit);
          height = Math.max(1, natural.height * fit);
        }
        layers.push({...makeLayer('svg', { name: target.mode === 'template' ? name + ' · SVG' : name, svg: sources.svg, w: width, h: height}), id: 'draft-svg'});
      }
      if (sources.html.trim() && tabs.includes('html')) {
        const result = compileHtml(sources.html, sources.css, {}, 'draft-template');
        fields = result.fields.length;
        warnings = result.warnings;
        layers.push({...makeLayer('html', { name, html: sources.html, css: sources.css, w: width, h: height}), id: 'draft-html'});
      }
    }
  } catch (reason) {
    const parser = reason as {reason?: string; line?: number; column?: number; message?: string};
    error = parser.reason ? 'CSS ' + parser.line + '행 ' + parser.column + '열 · ' + parser.reason : parser.message ?? '코드를 읽을 수 없습니다.';
  }

  const preview = {...project, width, height, layers, transparent: true, backgroundImage: ''};
  const previewZoom = Math.min(1, 335 / width, 340 / height);
  const valid = !error && layers.length > 0;
  const editor = <Modal close={close} notice={notice} wide title={isMask ? 'SVG 마스크 / 클리핑' : target.mode === 'template' ? 'AI 템플릿 가져오기' : existing ? '코드 편집' : initialTab === 'svg' ? 'SVG 추가' : '사용자 HTML 추가'}
    subtitle={isMask ? '레이어에 적용할 SVG 모양을 붙여넣으세요.' : '코드를 붙여넣고 결과를 확인한 뒤 적용하세요.'}>
    {target.mode === 'template' && <div className="html-import-row">
      <button className="button subtle" disabled={readingHtml} onClick={() => htmlInput.current?.click()}><Upload />HTML 가져오기</button>
      <span className="muted">{readingHtml ? 'HTML 파일을 읽는 중…' : 'HTML 파일은 별도 미리보기로 열립니다. 편집 프로젝트로 복원하면 새 프로젝트가 만들어집니다.'}</span>
      <input ref={htmlInput} type="file" hidden accept=".html,.htm,text/html" aria-label="HTML 파일 선택" onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        setHtmlError('');
        setReadingHtml(true);
        try {setHtmlFile(await loadHtmlFile(file));}
        catch (reason) {setHtmlError(reason instanceof Error ? reason.message : 'HTML 파일을 열 수 없습니다.');}
        finally {setReadingHtml(false);}
      }} />
      {htmlError && <div className="error-box html-import-error" role="alert">{htmlError}</div>}
    </div>}
    <div className="code-layout">
      <div className="code-editor">
        {!existing && <label className="field-stack"><span>이름</span><input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>}
        <div className="code-toolbar">
          <div className="segmented" aria-label="코드 언어">{tabs.map(item => <button className={tab === item ? 'chosen' : ''} key={item} onClick={() => setTab(item)}>{tabLabels[item]}</button>)}</div>
          {(tab === 'svg' || tab === 'mask') && <button className="button subtle" onClick={() => input.current?.click()}><Upload />SVG 파일</button>}
          <input type="file" ref={input} hidden accept=".svg,image/svg+xml" onChange={async event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            try {
              if (file.size > 2_000_000) throw new Error('2MB 이하 SVG를 선택하세요.');
              const value = await file.text();
              checkSvg(value);
              setSources(current => ({...current, [tab]: value}));
              setFileError('');
            } catch (reason) {setFileError((reason as Error).message);}
          }} />
        </div>
        {isMask && <label className="field-stack"><span>마스크 방식</span><select value={maskMode} onChange={event => setMaskMode(event.target.value as Layer['maskMode'])}>
          <option value="alpha">알파</option><option value="luminance">밝기</option><option value="clip">클리핑 윤곽</option>
        </select></label>}
        <textarea className="code-input" ref={textarea} aria-label={tabLabels[tab] + ' 코드'} spellCheck={false} value={sources[tab]}
          placeholder={tab === 'html' ? '<h1 id="name" data-editable="text">이름</h1>' : tab === 'css' ? '#name { color: #e3dcc6; }' : demoMask}
          onChange={event => {setFileError(''); setSources({...sources, [tab]: event.target.value});}} />
        {target.mode === 'template' && <p className="muted">편집 영역은 고유한 <code>id</code>와 <code>data-editable</code>로 표시합니다. 값은 <code>text</code>, <code>image</code>, <code>background</code>를 지원합니다.</p>}
        {isMask && <div className="row-buttons"><button className="button subtle" onClick={() => setSources({...sources, mask: demoMask})}>원형 예제</button><button className="button subtle" onClick={() => setSources({...sources, mask: ''})}>마스크 제거</button></div>}
        {(error || fileError) && <div className="error-box" role="alert"><AlertCircle size={16} />{error || fileError}</div>}
        {warnings.length > 0 && <p className="muted">{[...new Set(warnings)].join(' ')}</p>}
      </div>
      <div className="code-preview">
        <div className="preview-label"><span><i />실시간 미리보기</span>{fields > 0 && <span>{fields}개 편집 영역</span>}</div>
        <div className="preview-board checker">
          {valid ? <div style={{width: width * previewZoom, height: height * previewZoom}}>
            <div style={{transformOrigin: 'top left', transform: 'scale(' + previewZoom + ')'}}><Artboard project={preview} /></div>
          </div> : <div className="empty-preview"><CodeXml size={24} /><span>미리 볼 코드가 없습니다</span></div>}
        </div>
        <p className="muted">스크립트, 외부 URL과 미지원 리소스는 렌더링에서 제외됩니다.</p>
      </div>
    </div>
    <footer className="modal-footer">
      {target.mode === 'template' && <button className="button subtle" onClick={() => setShowGuide(true)}><BookOpen />지침</button>}
      {existing && <button className="button subtle" onClick={() => {setSources({html: existing.html, css: existing.css, svg: existing.svg, mask: existing.mask}); setMaskMode(existing.maskMode); setFileError('');}}>변경 되돌리기</button>}
      {target.mode === 'template' && <button className="button subtle" disabled={!valid} onClick={() => save(name.trim() || '템플릿', layers)}><Save />템플릿으로 저장</button>}
      <div className="spacer" /><button className="button subtle" onClick={close}>취소</button>
      <button className="button primary" disabled={!valid} onClick={() => apply(layers, patch)}>{existing ? '변경 적용' : target.mode === 'template' ? '캔버스에 적용' : '레이어 추가'}</button>
    </footer>
  </Modal>;
  return <>{editor}{showGuide && <TemplateGuideDialog close={() => setShowGuide(false)} />}
    {htmlFile && <HtmlPreviewDialog imported={htmlFile} close={() => setHtmlFile(undefined)} restore={restore} />}</>;
}

export function ExportDialog({project, close}: {project: Project; close: () => void}) {
  const [scale, setScale] = useState(project.outputScale);
  const [transparent, setTransparent] = useState(project.transparent);
  const [result, setResult] = useState<{url: string; blob: Blob}>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let url = '';
    setResult(undefined);
    setError('');
    exportPng({...project, transparent}, scale).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setResult({blob, url});
    }).catch(reason => {if (active) setError(reason.message);});
    return () => {active = false; if (url) URL.revokeObjectURL(url);};
  }, [project, scale, transparent]);
  return <Modal close={close} title="PNG 내보내기" subtitle="출력 이미지의 미리보기와 해상도를 확인하세요.">
    <div className="export-body">
      <div className="export-preview checker">{result ? <img src={result.url} alt="PNG 출력 미리보기" /> : error ?
        <div className="error-box" role="alert"><AlertCircle size={16} />{error}</div> : <div className="empty-preview"><FileImage size={24} />미리보기 생성 중…</div>}</div>
      <div className="export-options">
        <div className="segmented">{([1, 2, 4] as const).map(value => <button key={value} className={scale === value ? 'chosen' : ''} onClick={() => setScale(value)}>{value}×</button>)}</div>
        <strong>{project.width * scale} × {project.height * scale} px</strong>
        <label className="toggle"><span>투명 배경</span><input type="checkbox" checked={transparent} onChange={event => setTransparent(event.target.checked)} /></label>
      </div>
    </div>
    <footer className="modal-footer"><div className="spacer" /><button className="button subtle" onClick={close}>닫기</button>
      <button className="button primary" disabled={!result} onClick={() => result && download(result.blob, project.name + (scale === 1 ? '' : '@' + scale + 'x') + '.png')}><Download />PNG 다운로드</button></footer>
  </Modal>;
}

export function LibraryDialog({current, projects, templates, close, open, create, copy, remove, apply, removePreset, save, importFile, exportFile, notice}: {
  current: string;
  projects: SavedProject[];
  templates: SavedTemplate[];
  close: () => void;
  open: (project: Project) => void;
  create: () => void;
  copy: (project: Project) => void;
  remove: (item: SavedProject) => void;
  apply: (item: SavedTemplate) => void;
  removePreset: (item: SavedTemplate) => void;
  save: () => void;
  importFile: () => void;
  exportFile: () => void;
  notice?: DialogNotice;
}) {
  const [tab, setTab] = useState<'projects' | 'templates'>('projects');
  const date = (value: number) => new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeStyle: 'short'}).format(value);
  return <Modal title="작업 보관함" subtitle="이 브라우저에 자동 저장된 프로젝트와 템플릿입니다." close={close} notice={notice}>
    <div className="library">
      <div className="library-tools"><div className="segmented"><button className={tab === 'projects' ? 'chosen' : ''} onClick={() => setTab('projects')}>프로젝트</button>
        <button className={tab === 'templates' ? 'chosen' : ''} onClick={() => setTab('templates')}>템플릿</button></div>
        <button className="button subtle" onClick={tab === 'projects' ? create : save}>{tab === 'projects' ? <Plus /> : <Save />}{tab === 'projects' ? '새 프로젝트' : '현재 디자인 저장'}</button></div>
      <div className="library-list">
        {tab === 'projects' && (projects.length ? projects.map(item => <div className="library-row" key={item.id}>
          <button className="library-entry" onClick={() => open(item.project)}><FolderOpen size={17} /><span><strong>{item.project.name}{item.id === current && <em>편집 중</em>}</strong><small>{item.project.width} × {item.project.height} · {date(item.updated)}</small></span></button>
          <button className="icon-button" aria-label={item.project.name + ' 복제'} title="프로젝트 복제" onClick={() => copy(item.project)}><Copy /></button>
          <button className="icon-button danger" aria-label={item.project.name + ' 삭제'} title="프로젝트 삭제" onClick={() => remove(item)}><Trash2 /></button>
        </div>) : <p className="empty-panel">저장된 프로젝트가 없습니다.</p>)}
        {tab === 'templates' && (templates.length ? templates.map(item => <div className="library-row" key={item.id}>
            <button className="library-entry" onClick={() => apply(item)}><CodeXml size={17} /><span><strong>{item.name}</strong><small>{item.project.width} × {item.project.height} · {date(item.updated)}</small></span></button>
            <button className="icon-button danger" aria-label={item.name + ' 템플릿 삭제'} title="템플릿 삭제" onClick={() => removePreset(item)}><Trash2 /></button>
          </div>) : <p className="empty-panel">저장된 템플릿이 없습니다.</p>)}
      </div>
    </div>
    <footer className="modal-footer"><button className="button subtle" onClick={importFile}><Upload />JSON 가져오기</button><button className="button subtle" onClick={exportFile}><Download />JSON 백업</button><div className="spacer" /><button className="button subtle" onClick={close}>닫기</button></footer>
  </Modal>;
}

export function templateProject(project: Project, name: string, layers: Layer[]) {
  return {...newProject(name), width: project.width, height: project.height, transparent: true, layers};
}

