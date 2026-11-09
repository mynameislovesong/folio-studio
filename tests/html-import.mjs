import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium, devices} from 'playwright';

const url = process.env.FOLIO_TEST_URL || 'http://127.0.0.1:5173/folio-studio/';
const browser = await chromium.launch({channel: process.env.FOLIO_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)});
const external = 'https://folio-preview-test.invalid';
const fixture = `<!doctype html>
<html lang="ko"><head>
<meta http-equiv="refresh" content="0;url=${external}/redirect">
<link rel="dns-prefetch" href="${external}">
<style>
  :root { --card-fill: rgb(192, 192, 192); }
  .artboard { width: 1700px; aspect-ratio: 17 / 8; position: relative; display: grid; grid-template-columns: 1fr 1fr; }
  .window { position: absolute; left: 0; top: 0; width: min(460px, 50vw); height: 30vh; display: flex;
    transform: translate(7px, 9px); border: 2px outset white; box-shadow: 3px 3px black; }
  .title { color: white; background: navy; font-family: monospace }
  body.sheet > .artboard > .window { left: max(4%, 104px); top: 9%; }
  @media (min-width: 1600px) { body.sheet > .artboard > .window { background: var(--card-fill); } }
  @font-face { font-family: Probe; src: local("Arial"); }
  @keyframes stable { from { letter-spacing: 0 } to { letter-spacing: 0 } }
  .title { font-family: Probe, monospace; font-size: clamp(12px, 2vw, 36px); animation: stable 1s linear infinite; }
</style>
<script>document.body.dataset.executed = 'true'; parent.document.body.dataset.compromised = 'true'; fetch('${external}/script');</script>
</head><body class="sheet" style="margin:0; color:#ecffdb"><main class="artboard">
  <section class="window"><b class="title" id="card-title" data-editable="text">Windows 98</b><a href="${external}/link">링크</a></section>
  <img alt="내장 이미지" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1'%20height='1'%3E%3C/svg%3E">
  <img alt="외부 이미지" src="${external}/image.svg">
</main></body></html>`;
const file = (name, source, mimeType = 'text/html') => ({name, mimeType, buffer: Buffer.from(source)});
const previewName = 'HTML 파일 미리보기';

const measureDesign = frame => frame.locator('body').evaluate(body => {
  const windowElement = body.querySelector('.window');
  const title = body.querySelector('.title');
  const bounds = windowElement.getBoundingClientRect();
  return {viewport: [innerWidth, innerHeight], position: [bounds.x, bounds.y, bounds.width, bounds.height],
    bodyClass: body.className, bodyColor: getComputedStyle(body).color, background: getComputedStyle(windowElement).backgroundColor,
    titleSize: getComputedStyle(title).fontSize, animation: getComputedStyle(title).animationName,
    transparent: getComputedStyle(body).backgroundColor, css: document.querySelector('style').textContent};
});

function controls(page) {
  const button = name => page.getByRole('button', {name, exact: true});
  const preview = page.getByRole('dialog', {name: previewName});
  const upload = async files => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button('HTML 가져오기').click()]);
    await chooser.setFiles(files);
  };
  return {button, preview, upload};
}

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 960}, permissions: ['clipboard-read', 'clipboard-write']});
  const page = await context.newPage();
  const {button, preview, upload} = controls(page);
  const requests = [];
  await page.route(external + '/**', route => {
    requests.push(new URL(route.request().url()).pathname);
    return route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
  });
  await page.goto(url);
  await page.getByText('자동 저장됨', {exact: true}).waitFor();
  const name = page.getByLabel('프로젝트 이름');
  await name.fill('유지할 프로젝트');
  await name.press('Enter');
  await page.getByRole('checkbox', {name: '투명 배경', exact: true}).check();
  await button('텍스트 추가').click();
  await page.getByTestId('layer-row').waitFor();
  await page.getByText('자동 저장됨', {exact: true}).waitFor();
  await button('AI 템플릿 가져오기').click();
  const draft = page.getByRole('textbox', {name: 'HTML 코드'});
  await draft.fill('<p>보존할 초안</p>');
  await upload([]);
  assert.equal(await draft.inputValue(), '<p>보존할 초안</p>');
  await upload(file('invalid.txt', fixture, 'text/plain'));
  await page.getByRole('alert').getByText('.html 또는 .htm 파일을 선택하세요.').waitFor();
  await upload(file('encoding.html', Uint8Array.of(0xff, 0xfe, 0x61)));
  await page.getByRole('alert').getByText(/UTF-8로 저장한 HTML/).waitFor();
  assert.equal(await draft.inputValue(), '<p>보존할 초안</p>');

  const original = '\uFEFF' + fixture.replace(/\n/g, '\r\n');
  await upload(file('windows98.htm', original));
  const iframe = preview.locator('iframe');
  const frame = iframe.contentFrame();
  await frame.getByText('Windows 98', {exact: true}).waitFor();
  assert.equal(await iframe.getAttribute('sandbox'), '');
  assert.equal(await iframe.evaluate(element => element.contentDocument), null);
  assert.equal(await preview.getByRole('spinbutton', {name: '미리보기 너비'}).inputValue(), '1700');
  assert.equal(await preview.getByRole('spinbutton', {name: '미리보기 높이'}).inputValue(), '800');
  const layout = await frame.locator('body').evaluate(body => {
    const win = body.querySelector('.window');
    const bounds = win.getBoundingClientRect();
    return {viewport: [innerWidth, innerHeight], position: [bounds.x, bounds.y, bounds.width, bounds.height],
      grid: getComputedStyle(body.querySelector('main')).display, flex: getComputedStyle(win).display,
      shadow: getComputedStyle(win).boxShadow, transparent: getComputedStyle(body).backgroundColor,
      scripts: document.scripts.length, executed: body.dataset.executed, href: body.querySelector('a').getAttribute('href')};
  });
  assert.deepEqual(layout.viewport, [1700, 800]);
  assert.deepEqual(layout.position, [111, 81, 464, 244]);
  assert.equal(layout.grid, 'grid');
  assert.equal(layout.flex, 'flex');
  assert.notEqual(layout.shadow, 'none');
  assert.equal(layout.transparent, 'rgba(0, 0, 0, 0)');
  assert.equal(layout.scripts, 0);
  assert.equal(layout.executed, undefined);
  assert.equal(layout.href, null);
  const reference = await context.newPage({viewport: {width: 1700, height: 800}});
  await reference.setViewportSize({width: 1700, height: 800});
  // Compare native layout with a local fixture, leaving out its deliberate navigation/network probes.
  await reference.setContent(fixture.replace(/<meta http-equiv=.*\n|<link rel=.*\n|<script>.*<\/script>|<img alt="외부 이미지".*\n/g, ''));
  const expectedDesign = await measureDesign(reference);
  assert.equal(expectedDesign.titleSize, '34px');
  assert.equal(expectedDesign.background, 'rgb(192, 192, 192)');
  assert.equal(expectedDesign.animation, 'stable');
  assert.deepEqual(await measureDesign(frame), expectedDesign);
  await reference.close();
  assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
  await frame.getByAltText('내장 이미지').evaluate(image => image.decode());
  assert.deepEqual(requests, []);
  await preview.getByRole('checkbox', {name: /외부 HTTPS/}).check();
  await frame.getByAltText('외부 이미지').evaluate(image => image.decode());
  assert.deepEqual(requests, ['/image.svg']);
  await preview.getByRole('checkbox', {name: '체크무늬 배경'}).uncheck();
  assert.equal(await preview.locator('.html-frame-slot.checker').count(), 0);
  await button('100%').click();
  assert.equal((await preview.locator('.html-frame-slot').boundingBox()).width, 1700);
  await button('미리보기 축소').click();
  assert.equal((await preview.locator('.html-frame-slot').boundingBox()).width, 1360);
  await button('화면 맞춤').click();
  await button('코드 보기').click();
  const raw = preview.getByRole('textbox', {name: 'HTML 원본 코드'});
  assert.equal(await raw.inputValue(), original.replace(/\r\n/g, '\n'));
  assert.equal(await raw.getAttribute('readonly'), '');
  await button('코드 복사').click();
  await preview.getByText('원본 코드를 복사했습니다.', {exact: true}).waitFor();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), original.replace(/\r\n/g, '\n'));
  const [downloaded] = await Promise.all([page.waitForEvent('download'), button('HTML 다운로드').click()]);
  assert.equal(downloaded.suggestedFilename(), 'windows98.htm');
  assert.deepEqual(await readFile(await downloaded.path()), Buffer.from(original));
  await page.keyboard.press('Escape');
  await preview.waitFor({state: 'detached'});
  assert.equal(await draft.inputValue(), '<p>보존할 초안</p>');
  console.log('PASS native HTML layout, transparent iframe, sandbox, resource policy, zoom, clipboard and byte-for-byte download');

  await upload(file('windows98.htm', original));
  await button('적용').click();
  await preview.waitFor({state: 'detached'});
  assert.equal(await name.inputValue(), '유지할 프로젝트');
  assert.equal(await page.getByTestId('layer-row').count(), 2);
  assert.equal(await button('windows98').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('spinbutton', {name: '너비', exact: true}).inputValue(), '1700');
  assert.equal(await page.getByRole('spinbutton', {name: '높이', exact: true}).inputValue(), '800');
  const appliedFrame = page.frameLocator('iframe[title="windows98 미리보기"]');
  assert.deepEqual(await measureDesign(appliedFrame), expectedDesign);
  await button('확대').click();
  assert.deepEqual(await measureDesign(appliedFrame), expectedDesign);
  await button('PNG 내보내기').click();
  const exportDialog = page.getByRole('dialog', {name: 'PNG 내보내기'});
  const png = exportDialog.getByRole('img', {name: 'PNG 출력 미리보기'});
  const alert = exportDialog.getByRole('alert');
  await png.or(alert).first().waitFor();
  assert.equal(await alert.count(), 0, await exportDialog.locator('.export-preview').innerText());
  const pixels = await png.evaluate(async image => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return [[500, 250], [1680, 780]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  });
  assert.deepEqual(pixels, [[192, 192, 192, 255], [0, 0, 0, 0]]);
  assert.deepEqual(requests, ['/image.svg']);
  await exportDialog.getByRole('button', {name: '닫기', exact: true}).last().click();
  await button('실행 취소').click();
  assert.equal(await page.getByTestId('layer-row').count(), 1);
  await button('다시 실행').click();
  await page.getByText('자동 저장됨', {exact: true}).waitFor();
  await page.reload();
  assert.deepEqual(await measureDesign(appliedFrame), expectedDesign);
  await button('windows98').click();
  await page.getByLabel('card-title', {exact: true}).fill('수정한 제목');
  await appliedFrame.getByText('수정한 제목', {exact: true}).waitFor();
  await button('HTML / CSS 편집').click();
  assert.ok((await page.getByRole('textbox', {name: 'HTML 코드'}).inputValue()).includes('body class="sheet"'));
  await button('CSS').click();
  await page.getByRole('textbox', {name: 'CSS 코드'}).fill('body { background-color: #24352c }');
  await button('변경 적용').click();
  await appliedFrame.getByText('수정한 제목', {exact: true}).waitFor();
  assert.equal(await appliedFrame.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(36, 53, 44)');
  const layerWidth = page.getByRole('spinbutton', {name: '너비', exact: true});
  await layerWidth.fill('850');
  await layerWidth.press('Enter');
  assert.equal(await appliedFrame.locator('body').evaluate(() => innerWidth), 1700);
  await page.getByText('자동 저장됨', {exact: true}).waitFor();
  await page.reload();
  await appliedFrame.getByText('수정한 제목', {exact: true}).waitFor();
  await button('windows98').click();
  assert.equal(await layerWidth.inputValue(), '850');
  assert.equal(await appliedFrame.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(36, 53, 44)');
  await button('windows98 레이어 삭제').click();
  await button('AI 템플릿 가져오기').click();
  console.log('PASS browser/preview/canvas parity, undo/redo, reload, editable fields, zoom and PNG pixels');

  await upload(file('broken.html', '<p>원본 디자인</p><script type="application/json" id="folio-studio-project">{"version":2}</script>'));
  await preview.getByText(/데이터가 유효하지 않아/).waitFor();
  assert.equal(await preview.getByRole('button', {name: '편집 프로젝트로 복원'}).count(), 0);
  const width = preview.getByRole('spinbutton', {name: '미리보기 너비'});
  await width.fill('640');
  await width.press('Enter');
  assert.equal(await preview.locator('iframe').contentFrame().locator('body').evaluate(() => innerWidth), 640);
  await page.keyboard.press('Escape');

  const embedded = {version: 1, name: '복원 프로젝트', width: 1700, height: 800,
    layers: [{kind: 'text', name: '복원된 텍스트', text: '복원 완료', x: 110, y: 80, w: 240, h: 60}]};
  await upload(file('project.html', '<p>저장한 디자인</p><script type="application/json" id="folio-studio-project">' + JSON.stringify(embedded) + '</script>'));
  await button('편집 프로젝트로 복원').click();
  assert.equal(await name.inputValue(), '복원 프로젝트');
  await page.getByRole('button', {name: '복원된 텍스트', exact: true}).click();
  assert.equal(await page.getByRole('spinbutton', {name: 'X', exact: true}).inputValue(), '110');
  await page.getByText('자동 저장됨', {exact: true}).waitFor();
  await page.reload();
  assert.equal(await name.inputValue(), '복원 프로젝트');
  await button('보관함').click();
  await page.getByRole('button', {name: /유지할 프로젝트 1700 × 800/}).click();
  assert.equal(await name.inputValue(), '유지할 프로젝트');
  assert.equal(await page.getByTestId('layer-row').count(), 1);
  console.log('PASS invalid data fallback, manual size, recovery as a new project, IndexedDB and original project protection');

  const mobileContext = await browser.newContext({...devices['iPhone 13']});
  const mobile = await mobileContext.newPage();
  const mobileUi = controls(mobile);
  await mobile.goto(url);
  await mobileUi.button('AI 템플릿 가져오기').click();
  await mobileUi.upload(file('mobile.html', fixture));
  const mobileFrame = mobileUi.preview.locator('iframe');
  await mobileFrame.contentFrame().getByText('Windows 98', {exact: true}).waitFor();
  const mobileSlot = mobileUi.preview.locator('.html-frame-slot');
  await mobile.waitForFunction(() => document.querySelector('.html-frame-slot')?.getBoundingClientRect().width > 250);
  const box = await mobileSlot.boundingBox();
  const viewport = await mobileUi.preview.locator('.html-viewer-viewport').boundingBox();
  assert.ok(box.width <= viewport.width && Math.abs(box.width / box.height - 1700 / 800) < 0.01);
  assert.equal(await mobileFrame.contentFrame().locator('body').evaluate(() => innerWidth), 1700);
  await mobileUi.button('코드 보기').click();
  assert.ok(await mobileUi.preview.getByRole('textbox', {name: 'HTML 원본 코드'}).evaluate(el => el.scrollHeight > el.clientHeight));
  console.log('PASS phone viewport fit, full layout width and scrollable code');
} finally {
  await browser.close();
}
