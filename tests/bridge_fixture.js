/* Local host doubles for the browser fixtures. These never contact a real agent. */
const fixtureSpec=JSON.parse(document.querySelector('[data-visual-response-spec]').textContent);
const fixtureConfig=JSON.parse(document.querySelector('[data-visual-response-config]').textContent);
const fixtureKey='fixture-codex:'+fixtureSpec.stateKey;
const storageKey='visual-response:'+fixtureSpec.stateKey;
const write=(id,value)=>{document.getElementById(id).textContent=JSON.stringify(value,null,2)};
const read=key=>{try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
const legacy={key:fixtureSpec.stateKey,selected:(fixtureSpec.rows||[]).slice(0,1).map(row=>row.id),reviewed:[],notes:{},edits:{},stages:{},fields:{},options:{},comment:'Legacy draft'};
if(fixtureSpec.rows?.[0])legacy.notes[fixtureSpec.rows[0].id]='Legacy instruction';
const query=new URLSearchParams(location.search);
if(query.has('legacy')){
  if(fixtureConfig.adapter==='codex'&&!read(fixtureKey))localStorage.setItem(fixtureKey,JSON.stringify({privateContent:{draft:legacy}}));
  if(fixtureConfig.adapter==='claude-inline'&&!read(storageKey))localStorage.setItem(storageKey,JSON.stringify(legacy));
}
function receive(message){
  let envelope;
  try{envelope=JSON.parse(message)}catch{
    const line=message.split('\n').find(value=>value.startsWith('Feedback JSON: '));
    if(line)envelope={feedback:JSON.parse(line.slice('Feedback JSON: '.length))};
  }
  write('fixture-receipt',{message,feedback:envelope?.feedback});
  return query.has('fail')?Promise.reject(new Error('Simulated host failure')):Promise.resolve();
}
if(fixtureConfig.adapter==='codex'){
  window.openai={widgetState:read(fixtureKey),
    sendFollowUpMessage:({prompt})=>receive(prompt),
    setWidgetState:state=>{localStorage.setItem(fixtureKey,JSON.stringify(state));write('fixture-snapshot',state);return Promise.resolve()}};
}else{
  window.sendPrompt=message=>receive(message);
  document.getElementById('fixture-restore').disabled=true;
}
document.getElementById('fixture-reset').onclick=()=>{localStorage.removeItem(fixtureKey);localStorage.removeItem(storageKey);location.reload()};
document.getElementById('fixture-inspect').onclick=()=>write('fixture-snapshot',fixtureConfig.adapter==='codex'?read(fixtureKey):read(storageKey));
document.getElementById('fixture-appearance').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'};
document.getElementById('fixture-palette').onclick=()=>document.documentElement.style.setProperty('--border','#789abc');
document.getElementById('fixture-restore').onclick=()=>{
  const draft={...legacy,comment:'Incoming restored draft'};
  window.openai.widgetState={privateContent:{draft}};
  window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:window.openai.widgetState}}}));
};
