
import {zipEntries,zipText,wordSections} from './docx.js';
export function readTxt(buffer){
 const bytes=new Uint8Array(buffer);let encoding='utf-8';
 if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
 let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');}catch{throw new Error('احفظ الملف النصي بترميز UTF-8 أو UTF-16.');}
 if(!text.trim())throw new Error('المستند فارغ.');return wordSections([text]);
}
function parse(xml){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('ملف PowerPoint غير صالح.');const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('ملف PowerPoint غير صالح.');return doc;}
function normalizePath(path){const parts=[];for(const part of path.split('/')){if(part==='..'){if(!parts.length)throw new Error('ملف PowerPoint غير صالح.');parts.pop();}else if(part&&part!=='.')parts.push(part);}return parts.join('/');}
function inline(node){if(node.localName==='t')return node.textContent;return Array.from(node.children).map(inline).join('');}
function extract(node){
 if(node.localName==='tbl')return Array.from(node.children).filter(c=>c.localName==='tr').map(row=>Array.from(row.children).filter(c=>c.localName==='tc').map(cell=>extract(cell).join('; ')).join(' | '));
 if(node.localName==='p'){const value=inline(node).trim();return value?[value]:[];}
 return Array.from(node.children).flatMap(extract);
}
export async function readPptx(buffer){
 const entries=zipEntries(buffer);if(!entries.has('ppt/presentation.xml'))throw new Error('ملف PowerPoint غير صالح.');
 const presentation=parse(await zipText(buffer,entries.get('ppt/presentation.xml')));let paths=[];
 if(entries.has('ppt/_rels/presentation.xml.rels')){
  const rels=parse(await zipText(buffer,entries.get('ppt/_rels/presentation.xml.rels'))),map=new Map();
  for(const rel of Array.from(rels.getElementsByTagName('*')))if(rel.localName==='Relationship'&&rel.getAttribute('Type')?.endsWith('/slide')&&rel.getAttribute('TargetMode')!=='External'){const target=rel.getAttribute('Target');map.set(rel.getAttribute('Id'),normalizePath(target.startsWith('/')?target:'ppt/'+target));}
  paths=Array.from(presentation.getElementsByTagName('*')).filter(n=>n.localName==='sldId').map(n=>map.get(n.getAttribute('r:id')||Array.from(n.attributes).find(a=>a.localName==='id'&&a.prefix)?.value));
 }
 if(!paths.length)paths=[...entries.keys()].filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
 if(!paths.length||paths.length>200||paths.some(path=>!path||!entries.has(path)))throw new Error('PowerPoint يجب أن يحتوي على 1 إلى 200 شريحة.');
 const pages=[];let xmlSize=0,textSize=0;
 for(const [index,path] of paths.entries()){
  const xml=await zipText(buffer,entries.get(path));xmlSize+=xml.length;if(xmlSize>8*1024*1024)throw new Error('النص المستخرج طويل جدًا. اختر ملفًا أصغر.');
  const doc=parse(xml),text=extract(doc.documentElement).join('\n');textSize+=text.length;
  if(text.length>100000||textSize>1000000)throw new Error('النص المستخرج طويل جدًا. اختر ملفًا أصغر.');pages.push({page:index+1,text});
 }
 if(!pages.some(p=>p.text.trim()))throw new Error('الشرائح تحتوي على صور فقط. يلزم OCR أولًا.');return pages;
}
