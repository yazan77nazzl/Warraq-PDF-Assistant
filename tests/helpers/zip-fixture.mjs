
import {deflateRawSync} from 'node:zlib';
function crc(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;}
export function zipFixture(entries,compressed=true){
 const local=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(entries)){
  const filename=Buffer.from(name),plain=Buffer.from(text),data=compressed?deflateRawSync(plain):plain,method=compressed?8:0,sum=crc(plain);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(method,8);h.writeUInt32LE(sum,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(plain.length,22);h.writeUInt16LE(filename.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(sum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(plain.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);
  local.push(h,filename,data);central.push(c,filename);offset+=h.length+filename.length+data.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,dir,end]);
}
