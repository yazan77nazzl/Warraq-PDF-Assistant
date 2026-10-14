
export function extractPdfText(items){
 const valid=items.filter(i=>typeof i.str==='string'&&i.str.trim());
 if(valid.some(i=>!Array.isArray(i.transform)||Math.abs(i.transform[1])>.1||Math.abs(i.transform[2])>.1))return items.filter(i=>typeof i.str==='string').map(i=>i.str+(i.hasEOL?'\n':' ')).join('');
 const rows=[];const rtl=valid.reduce((n,i)=>n+(i.str.match(/[\u0600-\u06ff]/g)||[]).length,0)>valid.reduce((n,i)=>n+(i.str.match(/[a-z]/gi)||[]).length,0);
 for(const item of [...valid].sort((a,b)=>b.transform[5]-a.transform[5])){
  const y=item.transform[5],height=Math.abs(item.height||item.transform[3]||10);
  let row=rows.find(r=>Math.abs(r.y-y)<=Math.max(2,Math.min(r.height,height)*.3));
  if(!row){row={y,height,items:[]};rows.push(row);}row.items.push(item);
 }
 return rows.sort((a,b)=>b.y-a.y).map(row=>{
  const ordered=row.items.sort((a,b)=>rtl?b.transform[4]-a.transform[4]:a.transform[4]-b.transform[4]);
  let text='',last;
  for(const item of ordered){const gap=last?(rtl?last.transform[4]-(item.transform[4]+item.width):item.transform[4]-(last.transform[4]+last.width)):0;text+=(last?(gap>Math.max(12,row.height*1.5)?' | ':' '):'')+item.str;last=item;}
  return text;
 }).join('\n');
}
