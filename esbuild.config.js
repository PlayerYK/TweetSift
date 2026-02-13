const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');
const bumpTypeArg = process.argv.find(a => a.startsWith('--bump='))?.split('=')[1] || null;
const bumpType = isWatch ? null : (bumpTypeArg || 'patch');
// --watch              => 不升版本
// --bump=patch/minor   => 按指定策略升版本
// 无 --bump（非 watch） => 默认 patch（保证每次构建都升版本）

// ── 版本号管理 ──

const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (type === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else if (type === 'patch') {
    parts[2]++;
  }
  return parts.join('.');
}

if (bumpType) {
  const oldVersion = pkg.version;
  pkg.version = bumpVersion(oldVersion, bumpType);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Version: ${oldVersion} → ${pkg.version}`);
} else {
  console.log(`Version: ${pkg.version} (unchanged)`);
}

// ── 确保 dist 目录存在 ──

const distDir = path.join(__dirname, 'dist');
const iconsDir = path.join(distDir, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// ── 复制静态文件到 dist ──

function copyStaticFiles() {
  // manifest.json — 读取源文件，注入当前版本号后写入 dist
  const manifestPath = path.join(__dirname, 'src/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest.version = pkg.version;
  fs.writeFileSync(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  // popup.html
  fs.copyFileSync(
    path.join(__dirname, 'src/popup/popup.html'),
    path.join(distDir, 'popup.html')
  );
  // popup.css
  fs.copyFileSync(
    path.join(__dirname, 'src/popup/popup.css'),
    path.join(distDir, 'popup.css')
  );
  // content.css
  fs.copyFileSync(
    path.join(__dirname, 'src/content/content.css'),
    path.join(distDir, 'content.css')
  );
  // injected.js (注入到页面 main world 的脚本)
  fs.copyFileSync(
    path.join(__dirname, 'src/content/injected.js'),
    path.join(distDir, 'injected.js')
  );
  // icons
  const srcIcons = path.join(__dirname, 'src/icons');
  if (fs.existsSync(srcIcons)) {
    for (const file of fs.readdirSync(srcIcons)) {
      if (file.endsWith('.png')) {
        fs.copyFileSync(
          path.join(srcIcons, file),
          path.join(iconsDir, file)
        );
      }
    }
  }
}

// ── esbuild 配置 ──

const commonOptions = {
  bundle: true,
  minify: false,       // 开发阶段不压缩，方便调试
  sourcemap: false,
  target: ['chrome110'],
  format: 'iife',
  // 注入版本号，代码中可用 __VERSION__ 访问
  define: {
    '__VERSION__': JSON.stringify(pkg.version),
  },
};

const builds = [
  {
    ...commonOptions,
    entryPoints: ['src/content/index.js'],
    outfile: 'dist/content.bundle.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/background/index.js'],
    outfile: 'dist/background.bundle.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/popup/popup.js'],
    outfile: 'dist/popup.js',
  },
];

// ── 构建 ──

async function run() {
  copyStaticFiles();

  if (isWatch) {
    console.log('Watching for changes...');
    for (const config of builds) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
    }
    console.log('All watchers started');
  } else {
    console.log('Building...');
    for (const config of builds) {
      await esbuild.build(config);
    }
    console.log('Build complete');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
