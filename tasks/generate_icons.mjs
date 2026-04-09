import fs from 'fs';
import sharp from 'sharp';

const svgBuffer = fs.readFileSync('src/app/icon.svg');

async function run() {
  await sharp(svgBuffer).resize(192, 192).png().toFile('public/icon-192.png');
  await sharp(svgBuffer).resize(512, 512).png().toFile('public/icon-512.png');
  // Apple touch icons require a solid background because iOS doesn't support transparent icons
  // Flattening against the app's theme background color
  await sharp(svgBuffer).resize(180, 180).flatten({ background: '#8EC6E8' }).png().toFile('public/apple-icon.png');
  console.log('Icons successfully generated!');
}
run().catch(console.error);
