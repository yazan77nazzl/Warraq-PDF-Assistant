// Safari streams expose getReader() but may not implement async iteration.
export async function readPageText(page) {
 const reader=page.streamTextContent().getReader();
 const items=[];let chars=0;
 try {
  while(true){
   const {done,value}=await reader.read();if(done)break;
   for(const item of value.items||[]){chars+=(item.str||'').length;if(chars>100000)throw new Error('النص المستخرج طويل جدًا. اختر ملفًا أصغر.');items.push(item);}
  }
  return {items};
 }catch(error){try{await reader.cancel();}catch{}throw error;}
 finally{reader.releaseLock();}
}
