import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  path.join(root, 'miniprogram_npm/tdesign-miniprogram/icon/icon.wxss'),
  path.join(root, 'node_modules/tdesign-miniprogram/miniprogram_dist/icon/icon.wxss'),
];
const localFace =
  "@font-face{font-family:t;src:url('/assets/fonts/t.woff') format('woff');font-weight:400;font-style:normal;}";
const re = /@font-face\{font-family:t;[^}]+\}/;

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!re.test(text)) {
    console.log('skip (no face):', file);
    continue;
  }
  if (text.includes('/assets/fonts/t.woff')) {
    console.log('already local:', file);
    continue;
  }
  fs.writeFileSync(file, text.replace(re, localFace), 'utf8');
  console.log('patched:', file);
}

// Avoid deprecated wx.getSystemInfoSync when new info APIs exist (base lib >= 3.7).
const jsTargets = [
  path.join(root, 'miniprogram_npm/tdesign-miniprogram/common/wechat.js'),
  path.join(root, 'miniprogram_npm/tdesign-miniprogram/upload/upload.js'),
  path.join(root, 'node_modules/tdesign-miniprogram/miniprogram_dist/common/wechat.js'),
  path.join(root, 'node_modules/tdesign-miniprogram/miniprogram_dist/upload/upload.js'),
];
for (const file of jsTargets) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  text = text.replaceAll('||wx.getSystemInfoSync()', '||{}');
  text = text.replaceAll(
    'return wx.getSystemInfoSync().windowWidth/750*24',
    'return ((wx.getWindowInfo&&wx.getWindowInfo().windowWidth)||375)/750*24',
  );
  if (text !== before) {
    fs.writeFileSync(file, text, 'utf8');
    console.log('patched api:', file);
  }
}
