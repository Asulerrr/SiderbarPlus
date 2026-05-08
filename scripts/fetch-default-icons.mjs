/**
 * 拉取默认站点 favicon 并生成 dataUrl 常量。
 *
 * 使用方式（需 VPN）：
 *   node scripts/fetch-default-icons.mjs
 *
 * 生成 src/shared/defaultIcons.ts，constants.ts 引用后打包进应用，
 * 首次启动零网络依赖即可显示真实图标。
 */

import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITES = [
  { id: 'dev-bilibili', host: 'www.bilibili.com' },
  { id: 'dev-xiaohongshu', host: 'www.xiaohongshu.com' },
  { id: 'dev-doubao', host: 'www.doubao.com' },
  { id: 'dev-claude', host: 'claude.ai' },
  { id: 'dev-google', host: 'www.google.com' }
];

const SOURCES = [
  (host) => `https://icons.duckduckgo.com/ip3/${host}.ico`,
  (host) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
  (host) => `https://${host}/favicon.ico`
];

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchIcon(host) {
  for (const makeUrl of SOURCES) {
    try {
      const buf = await fetchBuffer(makeUrl(host));
      if (buf.length > 0) return buf;
    } catch { /* try next */ }
  }
  return null;
}

async function main() {
  const results = {};

  for (const site of SITES) {
    process.stdout.write(`${site.id} (${site.host}) ... `);
    const buf = await fetchIcon(site.host);
    if (buf) {
      results[site.id] = `data:image/png;base64,${buf.toString('base64')}`;
      console.log(`OK (${buf.length} bytes)`);
    } else {
      console.log('FAILED — 所有源均不可用');
    }
  }

  const lines = [
    '// 自动生成 — 请勿手动编辑',
    '// node scripts/fetch-default-icons.mjs',
    '',
    'export const DEFAULT_ICONS: Record<string, string> = {'
  ];

  for (const [id, dataUrl] of Object.entries(results)) {
    lines.push(`  '${id}': '${dataUrl}',`);
  }

  lines.push('};');
  lines.push('');

  const outPath = join(__dirname, '..', 'src', 'shared', 'defaultIcons.ts');
  await writeFile(outPath, lines.join('\n'), 'utf8');
  console.log(`\n写入 ${outPath}  (${Object.keys(results).length} 个图标)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
