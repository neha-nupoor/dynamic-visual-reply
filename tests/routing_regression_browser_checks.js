// Generate with: node tests/response_design_browser_fixtures.mjs <dir> --routing-regressions
async page => {
  const base = new URL('.', page.url()).href;
  const fixtures = await (await page.request.get(base + 'manifest.json')).json();
  const shapes = new Map();
  let checks = 0;
  for (const width of [320, 736]) {
    await page.setViewportSize({width, height:900});
    for (const f of fixtures) {
      await page.goto(base + f.name);
      const app = page.locator('.vr-app');
      await app.waitFor();
      if (await app.getAttribute('data-mode') !== (f.readOnly ? 'read-only' : 'review')) throw Error('Wrong mode: ' + f.name);
      const content = app.locator(f.view === 'cards' ? '.vr-cards' : '.vr-table-wrap');
      if (await content.count() !== 1) throw Error('Wrong layout: ' + f.name);
      const shape = await content.evaluate(element => ({
        text: element.innerText,
        boxes: [...element.children].map(child => {
          const box = child.getBoundingClientRect();
          return [box.width, box.height].map(Math.round);
        }),
      }));
      const key = width + '/' + f.view + '/' + f.readOnly;
      if (!shapes.has(key)) shapes.set(key, shape);
      if (JSON.stringify(shapes.get(key)) !== JSON.stringify(shape)) throw Error('Layout changed across triggers/hosts: ' + f.name);
      if (f.readOnly) {
        if (await app.locator('.vr-actions,.vr-feedback,.vr-item-feedback').count()) throw Error('Report has feedback controls');
        if (Object.values(await page.evaluate(() => window.calls)).some(Boolean)) throw Error('Report called draft/feedback host');
      } else {
        await app.getByRole('button', {name:'Choose inline', exact:true}).click();
        await app.getByLabel('Instruction for inline', {exact:true}).fill('Keep this feedback');
        await app.locator('.vr-actions button').click();
        const feedback = await page.evaluate(() => window.feedback);
        if (await page.evaluate(() => window.calls.submit) !== 1 || feedback?.items[0]?.instruction !== 'Keep this feedback')
          throw Error('Per-item feedback lost: ' + f.name);
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) throw Error('Page overflow');
      checks++;
    }
  }
  return {checks, fixtures:fixtures.length, widths:[320,736], matchingLayouts:shapes.size, nativeBridges:false};
}
