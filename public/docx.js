
const LIMIT=8*1024*1024;
const message='تعذّر قراءة Word. استخدم ملف .docx صالحًا وغير محمي.';
export function zipEntries(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0)throw new Error(message);
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true),size=view.getUint32(end+12,true);
 if(count>3000||view.getUint16(end+4,true)!==0||offset+size>end)throw new Error(message);
 const entries=new Map();let cursor=offset;
 for(let i=0;i<count;i++){
  if(cursor+46>bytes.length||view.getUint32(cursor,true)!==0x02014b50)throw new Error(message);
  const nameLength=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true);
  if(cursor+46+nameLength+extra+comment>bytes.length)throw new Error(message);
  const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+nameLength));
  if(entries.has(name))throw new Error(message);
  entries.set(name,{flags:view.getUint16(cursor+8,true),method:view.getUint16(cursor+10,true),compressed:view.getUint32(cursor+20,true),size:view.getUint32(cursor+24,true),offset:view.getUint32(cursor+42,true)});
  cursor+=46+nameLength+extra+comment;
 }
 return entries;
}
export async function zipText(buffer,entry){
 const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=entry.offset;
 if(entry.flags&1||entry.size>LIMIT||offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)throw new Error(message);
 const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
 if(start+entry.compressed>bytes.length)throw new Error(message);
 const compressed=bytes.subarray(start,start+entry.compressed);let output;
 if(entry.method===0)output=compressed;
 else if(entry.method===8){
  let stream;try{stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error('المتصفح لا يدعم قراءة Word. حدّث المتصفح أو حوّل الملف إلى PDF.');}
  const reader=stream.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();throw new Error(message);}parts.push(value);}}catch{throw new Error(message);}
  output=new Uint8Array(size);let cursor=0;for(const part of parts){output.set(part,cursor);cursor+=part.length;}
 }else throw new Error(message);
 if(output.length!==entry.size)throw new Error(message);
 return new TextDecoder('utf-8',{fatal:true}).decode(output);
}
function parse(xml){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error(message);const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error(message);return doc;}
function text(node){
 if(['del','delText','instrText'].includes(node.localName))return '';
 if(node.localName==='t')return node.textContent;
 if(node.localName==='tab')return ' | ';
 if(['br','cr'].includes(node.localName))return '\n';
 return [...node.children].map(text).join('');
}
function blocks(node){
 const output=[];
 for(const child of node.children){
  if(child.localName==='p'){const value=text(child).trim();if(value)output.push(value);}
  else if(child.localName==='tbl'){
   const rows=[...child.children].filter(c=>c.localName==='tr').map(row=>[...row.children].filter(c=>c.localName==='tc').map(cell=>blocks(cell).join('; ')).join(' | '));
   if(rows.length)output.push(rows.join('\n'));
  }else if(!['sectPr','del','drawing'].includes(child.localName))output.push(...blocks(child));
 }
 return output;
}
export function wordSections(blockList){
 const sections=[];let text='';
 for(const block of blockList){for(const line of block.split('\n')){
  if(text.length+line.length>6000&&text.trim()){sections.push({page:sections.length+1,text:text.trim()});text='';}
  text+=line+'\n';
 }}if(text.trim())sections.push({page:sections.length+1,text:text.trim()});
 if(sections.length>200||sections.some(p=>p.text.length>100000)||sections.reduce((n,p)=>n+p.text.length,0)>1000000)throw new Error('النص المستخرج طويل جدًا. اختر ملفًا أصغر.');
 return sections;
}
export async function readDocx(buffer){
 const entries=zipEntries(buffer);let main='word/document.xml';
 if(entries.has('_rels/.rels')){
  const rels=parse(await zipText(buffer,entries.get('_rels/.rels')));
  for(const rel of rels.getElementsByTagName('*'))if(rel.localName==='Relationship'&&(rel.getAttribute('Type')?.endsWith('/officeDocument')&&rel.getAttribute('TargetMode')!=='External'))main=rel.getAttribute('Target').replace(/^\//,'');
 }
 if(!entries.has(main))throw new Error(message);
 const mainXml=await zipText(buffer,entries.get(main));let xmlSize=mainXml.length;const document=parse(mainXml),body=[...document.getElementsByTagName('*')].find(n=>n.localName==='body');
 if(!body)throw new Error(message);const parts=blocks(body);
 const extras=[...entries.keys()].filter(name=>/^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(name));
 if(extras.length>100)throw new Error(message);
 for(const name of extras){const xml=await zipText(buffer,entries.get(name));xmlSize+=xml.length;if(xmlSize>LIMIT)throw new Error(message);const doc=parse(xml);parts.push(...blocks(doc.documentElement));}
 const sections=wordSections(parts);if(!sections.length)throw new Error('لم أجد نصًا في ملف Word. الملفات المصوّرة تحتاج OCR.');return sections;
}
