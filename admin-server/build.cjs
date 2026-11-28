/* Build only an explicit asset allowlist. Employee profiles stay on GitHub Pages. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'output', 'admin-deployment');
const publicDir = path.join(destination, 'public');
fs.mkdirSync(publicDir, { recursive: true });
const generator = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const reportase = fs.readFileSync(path.join(root, 'reportase.html'), 'utf8');
if (!generator.includes('id="profile-form"')) throw new Error('Generator source is missing.');
if (!reportase.includes('id="rt-form"')) throw new Error('Reportase generator source is missing.');
for (const file of ['style.css', 'script.js', 'qr-tools.js', 'photo-tools.js', 'generator-types.css', 'reportase.css', 'reportase.js', 'reportase-tools.js']) fs.copyFileSync(path.join(root, file), path.join(publicDir, file));
fs.cpSync(path.join(root, 'assets'), path.join(publicDir, 'assets'), { recursive: true });
const source = fs.readFileSync(path.join(__dirname, 'auth.mjs'), 'utf8');
fs.writeFileSync(path.join(destination, 'worker.mjs'), `${source}\nexport default { fetch: createHandler({ generatorHTML: ${JSON.stringify(generator)}, reportaseHTML: ${JSON.stringify(reportase)}, reportFailure: (phase, kind) => console.warn('ADMIN_LOGIN_FAILED', phase, kind) }) };\n`);
if (['index.html', 'generator.html', 'reportase.html'].some(file => fs.existsSync(path.join(publicDir, file)))) throw new Error('Private generator must never be a public static asset.');
console.log('Built protected admin Worker. No credentials or employee profiles included.');
