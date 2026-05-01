require('dotenv').config();

const ftp = require('basic-ftp');
const fs = require('fs/promises');
const fssync = require('fs');
const http = require('http');
const path = require('path');

const rootDir = __dirname;
const sourceDir = path.join(rootDir, 'site');
const distDir = path.join(rootDir, 'dist');
const htmlPages = [
  { source: 'index.html', outputDir: '' },
  { source: 'flight-deals.html', outputDir: 'flight-deals' },
  { source: 'cheap-flights.html', outputDir: 'cheap-flights' },
  { source: 'about.html', outputDir: 'about' },
  { source: 'contact.html', outputDir: 'contact' }
];

async function removeDir(target) {
  await chmodTree(target).catch(() => {});
  await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}

async function chmodTree(target) {
  const entries = await fs.readdir(target, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await chmodTree(entryPath);
    } else {
      await fs.chmod(entryPath, 0o666).catch(() => {});
    }
  }

  await fs.chmod(target, 0o777).catch(() => {});
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(from, entry.name);
    const targetPath = path.join(to, entry.name);

    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else {
      const content = await fs.readFile(sourcePath);
      await fs.writeFile(targetPath, content);
    }
  }
}

async function copyIfExists(fileName) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(distDir, fileName);

  try {
    const content = await fs.readFile(sourcePath);
    await fs.writeFile(targetPath, content);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function buildSite() {
  await prepareDist();
  await copyDir(path.join(sourceDir, 'assets'), path.join(distDir, 'assets'));

  for (const page of htmlPages) {
    const html = await fs.readFile(path.join(sourceDir, page.source), 'utf8');
    const outputDir = path.join(distDir, page.outputDir);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'index.html'), html);
  }

  await copyIfExists('sitemap.xml');
  await copyIfExists('robots.txt');
  await copyIfExists('.htaccess');

  console.log(`Built static site in ${distDir}`);
}

async function prepareDist() {
  await fs.mkdir(distDir, { recursive: true });
}

function getFtpConfig() {
  const required = ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing FTP environment variables: ${missing.join(', ')}`);
  }

  return {
    host: process.env.FTP_HOST,
    port: Number(process.env.FTP_PORT || 21),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    secure: String(process.env.FTP_SECURE || 'false').toLowerCase() === 'true',
    remoteDir: process.env.FTP_REMOTE_DIR || '/public_html',
    clearRemote: String(process.env.FTP_CLEAR_REMOTE || 'false').toLowerCase() === 'true'
  };
}

async function deploySite() {
  await buildSite();

  const config = getFtpConfig();
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.secure
    });

    await client.ensureDir(config.remoteDir);

    if (config.clearRemote) {
      await client.clearWorkingDir();
    }

    await client.uploadFromDir(distDir);
    console.log(`Uploaded static site to ${config.remoteDir}`);
  } finally {
    client.close();
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml'
  };

  return types[ext] || 'application/octet-stream';
}

async function serveSite() {
  await buildSite();

  const port = Number(process.env.PORT || 4173);
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://localhost:${port}`);
    const cleanPath = decodeURIComponent(requestUrl.pathname);
    let filePath = path.join(distDir, cleanPath);

    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (cleanPath.endsWith('/')) {
      filePath = path.join(filePath, 'index.html');
    } else if (!path.extname(filePath)) {
      filePath = path.join(filePath, 'index.html');
    }

    fssync.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      res.writeHead(200, { 'Content-Type': getContentType(filePath) });
      res.end(data);
    });
  });

  server.listen(port, () => {
    console.log(`Serving static site at http://localhost:${port}`);
  });
}

async function main() {
  const command = process.argv[2] || 'build';

  if (command === 'build') {
    await buildSite();
    return;
  }

  if (command === 'deploy') {
    await deploySite();
    return;
  }

  if (command === 'serve') {
    await serveSite();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
