import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'lib.js', 'restaurants.js', 'db.js', 'supabase-config.js', 'assets']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
await writeFile('dist/.nojekyll', '');
console.log('GitHub Pages 배포 파일을 dist/에 생성했습니다.');
