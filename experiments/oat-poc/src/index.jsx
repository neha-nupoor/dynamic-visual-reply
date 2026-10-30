import {Fragment, h, render} from 'preact';
import {useEffect, useId, useState} from 'preact/hooks';
import '@knadh/oat/oat.min.css';
import './preview.css';
import theme from '../../../skills/visual-response-design/themes/base-web/theme.json';
import '../../../skills/visual-response-design/harnesses/codex.js';

const root = document.getElementById('oat-response-preview');
const settings = JSON.parse(document.getElementById('oat-preview-settings').textContent);
const kinds = ['Form', 'Table', 'Cards', 'Board', 'Flow'];
const records = [
  {id:'labels', title:'Clear field labels', summary:'Keep labels above each control, with readable contrast.', area:'Forms', stage:'To review'},
  {id:'borders', title:'Visible borders', summary:'Give inputs and content a clear, quiet boundary.', area:'Controls', stage:'In progress'},
  {id:'surfaces', title:'Softer light surfaces', summary:'Use a cool gray background instead of a plain white canvas.', area:'Theme', stage:'To review'},
  {id:'actions', title:'Unambiguous actions', summary:'Use “Send to chat” for instructions sent to the agent.', area:'Copy', stage:'Done'},
  {id:'motion', title:'Keep motion minimal', summary:'Use a static flow with manual steps.', area:'Flow', stage:'Done'},
];
const steps = [
  ['Review', 'Read the options and inspect the details.'],
  ['Choose', 'Select the items you want to change.'],
  ['Add instructions', 'Keep feedback attached to the relevant item.'],
  ['Send to chat', 'Submit one deliberate message to the agent.'],
];
const host = window.visualResponseHosts.codex;
const stateKey = 'oat-poc-v1-' + (settings.appearance || 'light');
const empty = {key:stateKey, fields:{component:'Form', instruction:'Keep labels clear and controls neutral.', details:'Use a soft background and visible borders.', compact:true}, selected:[], notes:{}, stages:{}, comment:''};
const restored = host.loadDraft(stateKey);
const initial = restored?.key === stateKey ? {...empty,...restored,fields:{...empty.fields,...restored.fields}} : empty;

function Field({label, value, onChange, options, multiline, help, ...props}) {
  const id = useId();
  return <div data-field>
    <label htmlFor={id}>{label}</label>
    {options ? <select {...props} id={id} value={value} onChange={e=>onChange(e.currentTarget.value)}>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>
      : multiline ? <textarea {...props} id={id} rows={3} value={value} onInput={e=>onChange(e.currentTarget.value)}/>
      : <input {...props} id={id} value={value} onInput={e=>onChange(e.currentTarget.value)}/>}
    {help && <small data-hint>{help}</small>}
  </div>;
}

function App() {
  const [view,setView] = useState('Form');
  const [appearance,setAppearance] = useState(settings.appearance || 'light');
  const [draft,setDraft] = useState(initial);
  const [search,setSearch] = useState('');
  const [ascending,setAscending] = useState(true);
  const [page,setPage] = useState(0);
  const [active,setActive] = useState(0);
  const [preview,setPreview] = useState(false);
  const [receipt,setReceipt] = useState('Draft · nothing submitted');
  const [busy,setBusy] = useState(false);
  const colors = theme[appearance];
  const compact = settings.compact;
  const model = d => ({view,selectedIds:d.selected,fields:d.fields,notes:d.notes,stages:d.stages,comment:d.comment});
  function update(next) {
    setDraft(next);
    setReceipt('Draft · changes saved');
    host.saveDraft(stateKey,next,{modelContent:model(next)});
  }
  function assign(group,id,value) {update({...draft,[group]:{...draft[group],[id]:value}})}
  function toggle(id) {update({...draft,selected:draft.selected.includes(id)?draft.selected.filter(x=>x!==id):[...draft.selected,id]})}
  useEffect(()=>host.onExternalDraft(saved=>{if(saved?.key===stateKey)setDraft({...empty,...saved})}),[]);
  const feedback = {
    schemaVersion:1,viewId:stateKey,view:view==='Board'?'kanban':view.toLowerCase(),revision:1,
    selectedIds:draft.selected,
    items:[...records,...steps.map(([title],i)=>({id:'step-'+i,title}))].filter(row=>draft.selected.includes(row.id)||draft.notes[row.id]||draft.stages[row.id]).map(row=>({id:row.id,label:row.title,selected:draft.selected.includes(row.id),instruction:draft.notes[row.id]||'',changes:{},...(draft.stages[row.id]?{stage:draft.stages[row.id]}:{})})),
    reviewedIds:[],fields:Object.entries(draft.fields).map(([id,value])=>({id,value})),comment:draft.comment,
    source:{harness:'codex',theme:'base-web',rendererVersion:'oat-poc'},
  };
  const message = 'My feedback on the Oat preview:\n' + JSON.stringify(feedback,null,2);
  async function submit() {
    if(host.capabilities.submit !== 'message') {setPreview(true);setReceipt('Preview ready · nothing sent');return}
    setBusy(true);
    try {await host.submit({message,title:'Send Oat preview feedback to chat'});setReceipt('Sent to chat')}
    catch {setPreview(true);setReceipt('Could not send · your draft is still available')}
    finally {setBusy(false)}
  }
  const note = row => <Field label={'Instruction for ' + row.title.toLowerCase()} value={draft.notes[row.id] || ''} onChange={v=>assign('notes',row.id,v)}/>;
  const filtered = records.filter(r=>(r.title+' '+r.area).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>ascending?a.title.localeCompare(b.title):b.title.localeCompare(a.title));
  const last = Math.max(0,Math.ceil(filtered.length/3)-1), current = Math.min(page,last);
  const palette = {
    colorScheme:appearance,
    '--background':colors.surface,'--foreground':colors.text,'--card':colors.inputFill,'--card-foreground':colors.text,
    '--primary':colors.accent,'--primary-foreground':colors.onAccent,'--secondary':colors.hover,'--secondary-foreground':colors.text,
    '--muted':colors.hover,'--muted-foreground':colors.muted,'--faint':colors.hover,'--border':colors.divider,
    '--input':colors.inputBorder,'--ring':colors.accent,'--poc-selected':colors.selected,
    '--font-sans':theme.fontFamily,'--radius-small':'2px','--radius-medium':'2px','--radius-large':'0px',
  };
  return <section class={'oat-preview' + (compact?' oat-compact':'')} style={palette} aria-label={'Oat ' + appearance + ' preview'}>
    <header class="poc-header"><h2>{compact?(appearance==='light'?'Light mode':'Dark mode'):'Oat component review'}</h2><span class="badge outline">{compact?'Oat':'Proof of concept'}</span></header>
    {!compact && <div class="poc-toolbar">
      <nav aria-label="Components">{kinds.map(kind=><button type="button" key={kind} class="small" data-variant={view===kind?undefined:'secondary'} aria-pressed={view===kind} onClick={()=>{setView(kind);setPreview(false)}}>{kind}</button>)}</nav>
      <div class="poc-appearance" role="group" aria-label="Appearance">{['light','dark'].map(mode=><button type="button" class="small outline" aria-pressed={appearance===mode} onClick={()=>setAppearance(mode)}>{mode==='light'?'Light':'Dark'}</button>)}</div>
    </div>}
    {view==='Form' && <div class="poc-stack">
      <Field label="Component" value={draft.fields.component} options={kinds} onChange={v=>assign('fields','component',v)}/>
      <Field label="Your instruction" value={draft.fields.instruction} onChange={v=>assign('fields','instruction',v)}/>
      {!compact && <><Field label="Additional details" value={draft.fields.details} multiline help="Keep feedback specific to the component." onChange={v=>assign('fields','details',v)}/>
        <label class="poc-check"><input type="checkbox" checked={draft.fields.compact} onChange={e=>assign('fields','compact',e.currentTarget.checked)}/> Keep the response compact</label></>}
    </div>}
    {view==='Table' && <div class="poc-stack">
      <div class="poc-table-toolbar"><Field label="Search items" type="search" value={search} onChange={v=>{setSearch(v);setPage(0)}}/><span class="poc-muted" aria-live="polite">{draft.selected.length} selected</span></div>
      <div class="poc-table-wrap"><table><caption class="poc-sr-only">Review visual response preferences</caption><thead><tr><th scope="col">Select</th><th scope="col" aria-sort={ascending?'ascending':'descending'}><button type="button" class="ghost small" onClick={()=>setAscending(!ascending)}>Item {ascending?'↑':'↓'}</button></th><th scope="col">Area</th><th scope="col">Feedback</th></tr></thead>
        <tbody>{filtered.slice(current*3,current*3+3).map(row=><tr key={row.id} data-selected={draft.selected.includes(row.id)}><td><input type="checkbox" aria-label={'Select '+row.title} checked={draft.selected.includes(row.id)} onChange={()=>toggle(row.id)}/></td><th scope="row">{row.title}</th><td>{row.area}</td><td>{note(row)}</td></tr>)}</tbody></table></div>
      {!filtered.length && <p>No matching items.</p>}
      <div class="poc-pagination"><span class="poc-muted">Page {current+1} of {last+1}</span><button type="button" class="small outline" disabled={!current} onClick={()=>setPage(current-1)}>Previous</button><button type="button" class="small outline" disabled={current===last} onClick={()=>setPage(current+1)}>Next</button></div>
    </div>}
    {view==='Cards' && <div class="poc-grid">{records.slice(0,2).map(row=><article class="card" key={row.id} data-selected={draft.selected.includes(row.id)}><header><h3>{row.title}</h3></header><p>{row.summary}</p>{note(row)}<footer><button type="button" class="outline" aria-pressed={draft.selected.includes(row.id)} onClick={()=>toggle(row.id)}>{draft.selected.includes(row.id)?'Selected':'Select'}</button></footer></article>)}</div>}
    {view==='Board' && <div class="poc-board">{['To review','In progress','Done'].map(stage=><section class="poc-column" key={stage}><h3>{stage}</h3>{records.filter(r=>(draft.stages[r.id] || r.stage)===stage).map(row=><article class="card" key={row.id}><header><h4>{row.title}</h4></header><Field label={'Stage for '+row.title.toLowerCase()} value={stage} options={['To review','In progress','Done']} onChange={v=>assign('stages',row.id,v)}/></article>)}</section>)}</div>}
    {view==='Flow' && <div class="poc-stack"><ol class="poc-flow" aria-label="Response steps">{steps.map(([title],i)=><li key={title}><button type="button" class="outline" aria-current={active===i?'step':undefined} onClick={()=>setActive(i)}><span class="poc-step-number">{i+1}</span>{title}</button></li>)}</ol><p role="status">{steps[active][1]}</p><Field label="Instruction for this step" value={draft.notes['step-'+active] || ''} onChange={v=>assign('notes','step-'+active,v)}/></div>}
    <div class="poc-actions"><button type="button" onClick={submit} disabled={busy}>{busy?'Sending…':host.capabilities.submit==='message'?'Send to chat':'Preview instructions'}</button></div>
    <details class="poc-feedback"><summary>Feedback and actions</summary><div class="poc-stack"><Field label="General instruction" multiline value={draft.comment} onChange={v=>update({...draft,comment:v})}/><div><button type="button" class="outline" onClick={()=>setPreview(!preview)}>{preview?'Hide message':'Preview message'}</button></div></div></details>
    {preview && <pre class="poc-message" aria-label="Prepared feedback message">{message}</pre>}
    <p class="poc-receipt" role="status">{receipt}</p>
  </section>;
}
render(<App/>,root);
