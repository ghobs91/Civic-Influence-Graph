import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir: 'dist',
  sourcemap: true,
  minify: !isWatch,
};

const entryPoints = [
  { in: 'src/content/detector.ts', out: 'content/detector' },
  { in: 'src/background/worker.ts', out: 'background/worker' },
  { in: 'src/popup/Popup.tsx', out: 'popup/popup' },
];

/** Copy static assets (manifest, popup HTML) into dist/. */
function copyAssets() {
  const assets = [
    ['manifest.json', 'dist/manifest.json'],
    ['popup/popup.html', 'dist/popup/popup.html'],
  ];
  for (const [src, dest] of assets) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

if (isWatch) {
  const ctx = await context({
    ...commonOptions,
    entryPoints: entryPoints.map((e) => ({ in: e.in, out: e.out })),
  });
  copyAssets();
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build({
    ...commonOptions,
    entryPoints: entryPoints.map((e) => ({ in: e.in, out: e.out })),
  });
  copyAssets();
  console.log('Build complete.');
}
