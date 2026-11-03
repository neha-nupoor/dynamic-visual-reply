async page => {
  const base=new URL('.',page.url()).href,results=[];
  const check=(ok,message)=>{if(!ok)throw Error(message)};
  for(const view of ['table','cards','form','kanban','flow']){
    await page.goto(base+view+'-readonly.html');
    const app=page.locator('.vr-app');await app.waitFor();
    check(await app.getAttribute('data-mode')==='read-only',view+': wrong mode');
    check(await app.locator('.vr-actions,.vr-feedback,.vr-item-feedback,textarea').count()===0,view+': feedback UI present');
    check(!((await app.innerText()).includes('MUTATED DRAFT')),view+': restored an old edit');
    if(view==='table'){
      check(await app.locator('tbody input').count()===0,'table has edit or selection input');
      check(await app.locator('thead th').count()===2,'table has extra columns');
      await app.getByRole('button',{name:'Next page',exact:true}).click();
      check((await app.locator('tbody').innerText()).includes('Item 2'),'paging failed');
      await app.getByRole('searchbox',{name:'Search',exact:true}).fill('Item 4');
      check(await app.locator('tbody tr').count()===1,'search failed');
      await app.getByRole('searchbox',{name:'Search',exact:true}).fill('');
      await app.getByRole('button',{name:/^Amount/}).click();
      await app.getByRole('button',{name:/^Amount/}).click();
      check((await app.locator('tbody tr').first().innerText()).includes('Item 4'),'numeric sorting failed');
    }else if(view==='cards'){
      check(await app.locator('button,input,select').count()===0,'card action present');
      await app.locator('summary').first().click();
      check(await app.locator('details[open]').count()===1,'detail expansion failed');
      check(await app.getByRole('link',{name:'Source',exact:true}).count()===1,'source link missing');
    }else if(view==='form'){
      check(await app.locator('input,select,button').count()===0,'form controls present');
      const values=await app.locator('dd').allTextContents();
      check(JSON.stringify(values)===JSON.stringify(['0','No','Not provided','Alpha','Alpha','None selected']),'form values lost: '+JSON.stringify(values));
    }else if(view==='kanban'){
      check(await app.locator('input,select,button').count()===0,'board stage controls present');
      check(await app.locator('.vr-card').count()>0,'board records missing');
    }else{
      await app.locator('.vr-flow-controls button').last().click();
      check(await app.locator('.vr-step').last().getAttribute('aria-current')==='step','flow navigation failed');
    }
    const calls=await page.evaluate(()=>window.calls);
    check(Object.values(calls).every(x=>x===0),view+': host called '+JSON.stringify(calls));
    results.push({view,readOnly:true,calls});
  }
  await page.goto(base+'table-review.html');
  const app=page.locator('.vr-app');await app.waitFor();
  await app.getByRole('searchbox',{name:'Search',exact:true}).fill('MUTATED DRAFT');
  check((await app.innerText()).includes('MUTATED DRAFT'),'review draft restore regressed');
  await app.getByRole('button',{name:'Deselect visible',exact:true}).click();
  await app.getByRole('button',{name:'Send to chat',exact:true}).click();
  const calls=await page.evaluate(()=>window.calls);
  check(calls.load===1&&calls.subscribe===1&&calls.save>0&&calls.submit===1,'review mode regressed');
  results.push({view:'table',readOnly:false,calls});
  return results;
}
