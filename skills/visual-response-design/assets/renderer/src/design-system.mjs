import {createTheme} from '@mui/material';
import neutral from '../../../themes/neutral/theme.json';

export {neutral};

const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function merge(base,override){
  if(!isObject(override))return override===undefined?base:override;
  const out={...base};
  for(const [key,value] of Object.entries(override))out[key]=isObject(value)&&isObject(base?.[key])?merge(base[key],value):value;
  return out;
}

export function readJson(selector){
  const node=document.querySelector(selector);
  if(!node)return null;
  try{return JSON.parse(node.textContent)}catch{return null}
}

const colorPattern=/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;
// Optional accent roles, as in Base Web's dark theme: a fill dark enough for white labels, an outline, and text on the
// selected tint. A palette that omits them uses `accent` (and `onAccent`) for every job.
const accentRoles=['accentFill','onAccentFill','accentBorder','onSelected'];
function completePalette(c){
  return {...c,accentFill:c.accentFill??c.accent,onAccentFill:c.onAccentFill??c.onAccent,accentBorder:c.accentBorder??c.accent,onSelected:c.onSelected??c.accent};
}
export function resolvePalette(tokens,appearance,hostPalette,element,prefersDark){
  const dark=appearance==='dark'||((appearance==='system'||appearance==='host')&&prefersDark);
  const base=tokens[dark?'dark':'light'];
  if(appearance!=='host'||!hostPalette)return {dark,c:completePalette(base)};
  const style=getComputedStyle(element);
  const c={...base};
  // A host accent replaces the theme's whole accent family, so the theme's split roles don't mix with host colors.
  if(hostPalette.accent)accentRoles.forEach(role=>{delete c[role]});
  for(const [role,variable] of Object.entries(hostPalette)){
    const value=style.getPropertyValue(variable).trim();
    if(colorPattern.test(value))c[role]=value;
  }
  return {dark,c:completePalette(c)};
}

export function cssVariables(tokens,c){
  const vars={};
  for(const [role,value] of Object.entries(c))vars['--vr-'+role.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())]=value;
  vars['--vr-font']=tokens.fontFamily;
  vars['--vr-radius-control']=tokens.radius.control+'px';
  vars['--vr-radius-surface']=tokens.radius.surface+'px';
  vars['--vr-control-height']=tokens.control.minHeight+'px';
  return vars;
}

export function responseTheme(tokens,c,dark){
  const {type,control,radius,layout}=tokens;
  const focus={outline:`${control.focusWidth}px solid ${c.accent}`,outlineOffset:control.focusOffset};
  const [inputY,inputX]=control.inputPadding,[cellY,cellX]=tokens.table.cellPadding;
  return createTheme({
    palette:{mode:dark?'dark':'light',primary:{main:c.accent,contrastText:c.onAccent},background:{default:c.canvas,paper:c.surface},text:{primary:c.text,secondary:c.muted},divider:c.divider,action:{hover:c.hover,selected:c.selected},success:{main:c.success},warning:{main:c.warning},error:{main:c.error}},
    spacing:tokens.spacingUnit,
    shape:{borderRadius:radius.control},
    typography:{fontFamily:tokens.fontFamily,fontSize:type.body,h6:{fontSize:type.title,fontWeight:700,lineHeight:type.titleLineHeight,letterSpacing:type.titleTracking},body1:{fontSize:type.body,lineHeight:type.lineHeight},body2:{fontSize:type.small,lineHeight:type.lineHeight},button:{fontSize:type.small,fontWeight:600,textTransform:'none'},caption:{fontSize:type.small,lineHeight:type.lineHeight}},
    components:{
      MuiButtonBase:{styleOverrides:{root:{'&.Mui-focusVisible':focus}}},
      MuiButton:{defaultProps:{size:'small',disableElevation:true},styleOverrides:{root:{minHeight:control.minHeight,borderRadius:radius.control,padding:`${control.paddingY}px ${control.paddingX}px`},outlined:{borderColor:c.controlBorder,color:c.text},text:{color:c.text},contained:{backgroundColor:c.accentFill,color:c.onAccentFill,'&:hover':{backgroundColor:c.accentFill,filter:'brightness(1.08)'}}}},
      MuiTextField:{defaultProps:{size:'small',variant:'outlined'}},
      MuiOutlinedInput:{styleOverrides:{root:{backgroundColor:c.surface,'& .MuiOutlinedInput-notchedOutline':{borderColor:c.controlBorder},'&:hover .MuiOutlinedInput-notchedOutline':{borderColor:c.text},'&.Mui-focused .MuiOutlinedInput-notchedOutline':{borderColor:c.accent,borderWidth:2}},input:{padding:`${inputY}px ${inputX}px`,fontSize:type.body}}},
      MuiInputLabel:{styleOverrides:{root:{color:c.muted}}},
      MuiFormHelperText:{styleOverrides:{root:{marginLeft:0,color:c.muted}}},
      MuiCard:{defaultProps:{variant:'outlined'},styleOverrides:{root:{borderRadius:radius.surface,boxShadow:'none'}}},
      MuiCardContent:{styleOverrides:{root:{padding:layout.surfacePadding,'&:last-child':{paddingBottom:layout.surfacePadding}}}},
      MuiChip:{styleOverrides:{root:{fontWeight:600,fontSize:type.meta,borderRadius:radius.chip,backgroundColor:c.hover,color:c.muted},colorPrimary:{backgroundColor:c.selected,color:c.onSelected}}},
      MuiTableCell:{styleOverrides:{root:{fontSize:type.small,borderColor:c.divider,verticalAlign:'top',padding:`${cellY}px ${cellX}px`},head:{color:c.muted,fontWeight:600,backgroundColor:c.hover},body:{'&:has(input[type="number"])':{fontVariantNumeric:'tabular-nums'}}}},
      MuiTableRow:{styleOverrides:{root:{'&.Mui-selected, &.Mui-selected:hover':{backgroundColor:c.selected}}}},
      MuiFormControlLabel:{styleOverrides:{label:{fontSize:type.small},root:{minHeight:control.minHeight}}},
      MuiCheckbox:{defaultProps:{size:'small'},styleOverrides:{root:{color:c.controlBorder}}},
    },
  });
}
