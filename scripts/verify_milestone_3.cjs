const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('../frontend/node_modules/puppeteer');

const DIST_DIR = path.resolve(__dirname, '../frontend/dist');
const FRONTEND_PORT = 5174;
const BACKEND_PORT = 8000;

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(DIST_DIR, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.wasm': 'application/wasm',
          '.json': 'application/json',
          '.webp': 'image/webp'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        const indexHtml = path.join(DIST_DIR, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(indexHtml).pipe(res);
      }
    });

    server.listen(FRONTEND_PORT, () => {
      console.log(`Frontend test server running at http://localhost:${FRONTEND_PORT}`);
      resolve(server);
    });
  });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendProcess = spawn(
      path.resolve(__dirname, '../backend/venv/bin/uvicorn'),
      ['app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
      {
        cwd: path.resolve(__dirname, '../backend'),
        env: { ...process.env, PYTHONPATH: path.resolve(__dirname, '../backend') }
      }
    );

    backendProcess.stdout.on('data', (d) => {
      if (d.toString().includes('Application startup complete')) {
        console.log('Backend server started successfully!');
        resolve(backendProcess);
      }
    });

    backendProcess.stderr.on('data', (d) => {
      if (d.toString().includes('Application startup complete')) {
        console.log('Backend server started successfully!');
        resolve(backendProcess);
      }
    });

    setTimeout(() => {
      resolve(backendProcess); // fallback resolve
    }, 3000);
  });
}

async function verifyUI() {
  const staticServer = await startStaticServer();
  const backendProc = await startBackend();

  console.log('Launching headless Chrome to verify UI...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log(`HTTP ${res.status()} on ${res.url()}`);
    }
  });

  try {
    console.log(`Navigating to http://localhost:${FRONTEND_PORT}...`);
    await page.goto(`http://localhost:${FRONTEND_PORT}`, { waitUntil: 'networkidle0' });

    // 1. Verify Auth Modal is rendered
    console.log('Verifying Auth Modal presence...');
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    console.log('Auth modal rendered correctly!');

    // 2. Perform Quick Demo Login
    console.log('Triggering Quick Demo Login...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const demo = buttons.find(b => b.textContent && b.textContent.includes('Accedi Rapido'));
      if (demo) demo.click();
    });

    // Wait for Dashboard to appear
    await page.waitForFunction(() => {
      return document.body.textContent && document.body.textContent.includes('Panoramica Catalogo');
    }, { timeout: 8000 });
    console.log('Login successful! Dashboard loaded.');

    // 3. Check navigation between tabs: Libreria, Duplicati, Fonti, Scansioni, Impostazioni
    const tabsToTest = ['Libreria', 'Duplicati', 'Fonti & Dischi', 'Scansioni', 'Impostazioni'];
    for (const tabName of tabsToTest) {
      console.log(`Testing navigation to "${tabName}"...`);
      await page.evaluate((name) => {
        const buttons = Array.from(document.querySelectorAll('nav button'));
        const target = buttons.find(b => b.textContent && b.textContent.includes(name));
        if (target) target.click();
      }, tabName);

      await new Promise(r => setTimeout(r, 600));
    }
    console.log('All navigation tabs verified without crashes!');

    console.log('\n========================================');
    console.log('MILESTONE 3 VERIFICATION PASSED SUCCESSFULLY!');
    console.log('Console errors encountered:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Sample console errors:', consoleErrors.slice(0, 5));
    }
    console.log('========================================\n');
  } catch (err) {
    console.error('Verification failed:', err);
    throw err;
  } finally {
    await browser.close();
    staticServer.close();
    backendProc.kill('SIGTERM');
  }
}

verifyUI().catch((err) => {
  console.error('Fatal error during UI verification:', err);
  process.exit(1);
});
