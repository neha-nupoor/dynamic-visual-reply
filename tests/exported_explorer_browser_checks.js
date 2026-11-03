async (page, html) => {
  const external = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  const expected = {short:'Chat text',shared:'Read-only cards',custom:'Agent-designed UI',review:'Review table',override:'Chat text'};
  let cases = 0;
  await page.context().setOffline(true);
  try {
    for (const width of [736, 320]) for (const colorScheme of ['light', 'dark']) {
      await page.setViewportSize({width, height:900});
      await page.emulateMedia({colorScheme});
      await page.setContent(html);
      const frame = page.frameLocator('iframe');
      await frame.locator('#rd-request').waitFor();
      for (const [id, label] of Object.entries(expected)) {
        await frame.locator('#rd-request').selectOption(id);
        if (await frame.locator('#rd-result').innerText() !== label) throw Error('Wrong exported route: ' + id);
        cases++;
      }
      await frame.locator('details').evaluate(element => { element.open = true; });
      if (!(await frame.locator('#rd-facts').innerText()).includes('requested-format')) throw Error('Missing route details');
      if (await frame.locator('body').evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1))
        throw Error('Exported demo overflow at ' + width);
    }
    if (external.length || errors.length) throw Error(JSON.stringify({external, errors}));
    return {cases, widths:[736,320], appearances:['light','dark'], offline:true, externalRequests:external, errors};
  } finally { await page.context().setOffline(false); }
}
