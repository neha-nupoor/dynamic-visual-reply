#!/usr/bin/env node
// Generate deterministic browser fixtures with an observable host double.
// Usage: node tests/read_only_fixtures.mjs <output-dir>; serve that directory,
// then run read_only_browser_checks.js against its root with Playwright.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, load, render} from '../skills/dynamic-visual-reply/scripts/render.mjs';
import {resolve} from '../skills/dynamic-visual-reply/scripts/visual-config.mjs';
const out=path.resolve(process.argv[2]);
fs.mkdirSync(out,{recursive:true});
for(const view of ['table','cards','form','kanban','flow'])for(const readOnly of [true,false]){
  const spec=load(path.join(ROOT,'assets/examples',view+'.json'));
  Object.assign(spec,{viewId:'readonly-regression-'+view,readOnly});
  if(view==='table')Object.assign(spec,{columns:[{key:'name',label:'Name'},{key:'amount',label:'Amount',type:'number',editable:true}],pageSize:2,rows:Array.from({length:5},(_,i)=>({id:'item-'+i,name:'Item '+i,amount:i}))});
  if(view==='cards')spec.rows[0].source='https://example.com/evidence';
  if(view==='form')spec.fields=[
    {id:'zero',label:'Zero amount',type:'number',value:0},
    {id:'false',label:'Explicit false',type:'checkbox',value:false},
    {id:'missing',label:'Unknown flag',type:'checkbox'},
    {id:'choice',label:'Choice',type:'select',value:'a',options:[{id:'a',label:'Alpha'}]},
    {id:'multi',label:'Selected labels',type:'multiselect',options:[{id:'a',label:'Alpha',selected:true},{id:'b',label:'Beta',selected:false}]},
    {id:'empty',label:'Empty selection',type:'multiselect',options:[{id:'b',label:'Beta',selected:false}]},
  ];
  const file=path.join(out,view+'-'+(readOnly?'readonly':'review')+'.html');
  render(spec,file,'inline',undefined,undefined,{context:resolve({appearance:'light'},{harness:'codex',isolated:true})});
  let html=fs.readFileSync(file,'utf8');
  const spy=`<script>
window.calls={load:0,save:0,subscribe:0,submit:0};
window.dynamicVisualReplyHost={id:'test',capabilities:{submit:'message',persist:true,restore:true},
loadDraft(key){calls.load++;return {key,selected:['item-0'],edits:{'item-0':{name:'MUTATED DRAFT'}},fields:{zero:999}}},
saveDraft(){calls.save++},onExternalDraft(fn){calls.subscribe++;window.deliverDraft=fn;return ()=>{}},submit(){calls.submit++;return Promise.resolve({receipt:'submitted'})}};
</script>`;
  html=html.replace('<script data-dynamic-visual-reply-runtime>',spy+'<script data-dynamic-visual-reply-runtime>');
  fs.writeFileSync(file,'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Read-only regression</title></head><body>'+html+'</body></html>');
}
console.log(JSON.stringify({out,fixtures:10}));
