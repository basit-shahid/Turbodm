import { Jimp } from 'jimp';
import pngToIco from 'png-to-ico';
import fs from 'node:fs/promises';

// Match the desktop workspace's mint lightning mark without external fonts/assets.
const size = 1024;
const image = new Jimp({width:size, height:size, color:0x00000000});
const bolt = [[564,180],[278,563],[483,563],[450,844],[757,438],[545,438]];
function insidePolygon(x,y) {
  let inside = false;
  for (let i=0,j=bolt.length-1;i<bolt.length;j=i++) {
    const [xi,yi]=bolt[i], [xj,yj]=bolt[j];
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
for (let y=64;y<960;y++) {
  for (let x=64;x<960;x++) {
    const dx=Math.max(244-x,0,x-780),dy=Math.max(244-y,0,y-780);
    if (dx*dx+dy*dy<=180*180) image.setPixelColor(insidePolygon(x,y)?0x182332ff:0x68d5b2ff,x,y);
  }
}
image.resize({w:512,h:512});
await fs.mkdir('build',{recursive:true});
await image.write('build/icon.png');
await fs.writeFile('build/icon.ico',await pngToIco('build/icon.png'));
console.log('Generated TurboDM PNG and Windows ICO assets');
