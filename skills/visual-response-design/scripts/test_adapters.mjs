// Contract checks for harness adapters: node --test scripts/test_adapters.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import vm from 'node:vm';

// Objects made inside the vm sandbox have foreign prototypes, so compare their JSON form.
const same=(actual,expected,message)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),message);
const harnesses=join(dirname(fileURLToPath(import.meta.url)),'..','harnesses');

function load(file,extra={}){
  const store=new Map();
  const listeners={};
  const window={
    localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))},
    addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn)},
    removeEventListener:(type,fn)=>{listeners[type]=(listeners[type]||[]).filter(f=>f!==fn)},
    dispatch:(type,detail)=>(listeners[type]||[]).forEach(fn=>fn({detail})),
    location:{protocol:'http:',hostname:'127.0.0.1'},
    TextEncoder,Promise,JSON,setTimeout,clearTimeout,
    ...extra,
  };
  window.window=window;
  vm.runInNewContext(readFileSync(join(harnesses,file),'utf8'),Object.assign(window,{localStorage:window.localStorage,location:window.location}));
  return {host:window.visualResponseHost,window,store};
}

const draft={key:'k1',selected:['a']};
const message={message:'{"request":"go"}',feedback:{schemaVersion:1},title:'Review'};

test('every profile adapter defines the host interface',()=>{
  for(const file of readdirSync(harnesses).filter(f=>f.endsWith('.json'))){
    const profile=JSON.parse(readFileSync(join(harnesses,file),'utf8'));
    if(!profile.adapter)continue;
    const {host}=load(profile.adapter,{openai:{},sendPrompt(){}});
    assert.equal(typeof host.submit,'function',file);
    assert.ok(['message','save','none'].includes(host.capabilities.submit),file);
    assert.equal(typeof host.saveDraft,'function',file);
    assert.equal(typeof host.loadDraft,'function',file);
  }
});

test('codex adapter keeps renderer 1.0 calls',async()=>{
  const calls=[];
  const openai={sendFollowUpMessage:a=>{calls.push(['send',a]);return Promise.resolve()},setWidgetState:s=>{calls.push(['state',s])},widgetState:{privateContent:{draft}}};
  const {host,window}=load('codex.js',{openai});
  assert.equal(host.capabilities.submit,'message');
  await host.submit(message);
  same(calls[0],['send',{prompt:message.message,title:'Review'}]);
  host.saveDraft('k1',draft,{modelContent:{viewId:'v'}});
  same(calls[1],['state',{modelContent:{viewId:'v'},privateContent:{draft}}]);
  same(host.saveDraft('k1',{key:'k1',notes:{a:'x'.repeat(20000)}},{modelContent:{}}),{warning:'draftTooLarge'});
  same(host.loadDraft('k1'),draft);
  let restored=null;
  const stop=host.onExternalDraft(d=>{restored=d});
  window.dispatch('openai:set_globals',{globals:{widgetState:{draft:{key:'k1',selected:['b']}}}});
  same(restored.selected,['b']);
  stop();
});

test('codex adapter without a host uses local storage and cannot submit',()=>{
  const {host,store}=load('codex.js');
  assert.equal(host.capabilities.submit,'none');
  host.saveDraft('k1',draft,{modelContent:{}});
  assert.ok(store.has('visual-response:k1'));
  same(host.loadDraft('k1'),draft);
});

test('claude-inline adapter sends through sendPrompt',async()=>{
  const sent=[];
  const {host}=load('claude-inline.js',{sendPrompt:m=>sent.push(m)});
  assert.equal(host.capabilities.submit,'message');
  await host.submit(message);
  same(sent,[message.message]);
  assert.equal(load('claude-inline.js').host.capabilities.submit,'none');
});

test('claude-artifact adapter writes batches and per-viewer drafts',async()=>{
  const writes=[];
  const doc=path=>({set:d=>{writes.push(['set',path,d]);return Promise.resolve()},get:()=>Promise.resolve({exists:true,data:()=>({draft:JSON.stringify(draft)})})});
  const db={collection:path=>({add:d=>{writes.push(['add',path,d]);return Promise.resolve({})},doc:id=>doc(path+'/'+id)})};
  const user={id:()=>Promise.resolve('u_1')};
  const claude={use:name=>Promise.resolve(name==='db'?db:name==='user'?user:null)};
  const {host}=load('claude-artifact.js',{claude});
  await host.submit(message);
  assert.equal(writes[0][0],'add');
  assert.equal(writes[0][1],'batches');
  assert.equal(writes[0][2].by,'u_1');
  same(writes[0][2].feedback,{schemaVersion:1});
  same(await host.loadDraft('k1'),draft);
  host.saveDraft('k1',draft);
  await new Promise(r=>setTimeout(r,900));
  same(writes.at(-1).slice(0,2),['set','data/users/u_1/vr-k1']);
});

test('claude-artifact adapter reports missing storage as a failure',async()=>{
  const {host}=load('claude-artifact.js',{claude:{use:()=>Promise.resolve(null)}});
  await assert.rejects(host.submit(message));
});

test('browser-local adapter posts to serve.py only on loopback',async()=>{
  const posted=[];
  const fetch=(url,init)=>{posted.push([url,JSON.parse(init.body)]);return Promise.resolve({ok:true,json:()=>Promise.resolve({saved:true,path:'/tmp/v.feedback.json'})})};
  const {host}=load('browser-local.js',{fetch});
  assert.equal(host.capabilities.submit,'save');
  same(await host.submit(message),{detail:'/tmp/v.feedback.json'});
  assert.equal(posted[0][0],'/api/feedback');
  const fileHost=load('browser-local.js',{location:{protocol:'file:',hostname:''}}).host;
  assert.equal(fileHost.capabilities.submit,'none');
});
