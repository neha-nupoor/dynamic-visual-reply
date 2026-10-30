// Contract checks for harness adapters: node --test scripts/test_adapters.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import vm from 'node:vm';

// Objects made inside the vm sandbox have foreign prototypes, so compare their JSON form.
const same=(actual,expected,message)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),message);
const adapters=join(dirname(fileURLToPath(import.meta.url)),'adapters');
const adapterIds={'codex.js':'codex','claude.js':'claude-inline','browser.js':'browser-local'};

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
  vm.runInNewContext(readFileSync(join(adapters,file),'utf8'),Object.assign(window,{localStorage:window.localStorage,location:window.location}));
  return {host:window.dynamicVisualReplyHosts[adapterIds[file]],window,store};
}

const draft={key:'k1',selected:['a']};
const message={message:'{"request":"go"}',feedback:{schemaVersion:1},title:'Review'};

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
  assert.ok(store.has('dynamic-visual-reply:k1'));
  same(host.loadDraft('k1'),draft);
});

test('claude-inline adapter sends through sendPrompt',async()=>{
  const sent=[];
  const {host}=load('claude.js',{sendPrompt:m=>sent.push(m)});
  assert.equal(host.capabilities.submit,'message');
  await host.submit(message);
  same(sent,[message.message]);
  assert.equal(load('claude.js').host.capabilities.submit,'none');
});

test('browser-local adapter posts to serve.mjs only on loopback',async()=>{
  const posted=[];
  const fetch=(url,init)=>{posted.push([url,JSON.parse(init.body)]);return Promise.resolve({ok:true,json:()=>Promise.resolve({saved:true,path:'/tmp/v.feedback.json'})})};
  const {host}=load('browser.js',{fetch});
  assert.equal(host.capabilities.submit,'save');
  same(await host.submit(message),{detail:'/tmp/v.feedback.json'});
  assert.equal(posted[0][0],'/api/feedback');
  const fileHost=load('browser.js',{location:{protocol:'file:',hostname:''}}).host;
  assert.equal(fileHost.capabilities.submit,'none');
});

test('renamed adapters restore legacy browser drafts and prefer newer saved values',()=>{
  for(const file of Object.keys(adapterIds)){
    const {host,store}=load(file);
    store.set('visual-response:k1',JSON.stringify(draft));
    same(host.loadDraft('k1'),draft,file+' restores legacy storage');
    const edited={...draft,selected:['b']};
    host.saveDraft('k1',edited,{modelContent:{}});
    same(host.loadDraft('k1'),edited,file+' prefers new storage');
    same(JSON.parse(store.get('visual-response:k1')),draft,'legacy value is not rewritten');
    assert.ok(store.has('dynamic-visual-reply:k1'));
  }
});
