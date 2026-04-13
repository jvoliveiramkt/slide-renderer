const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '10mb' }));

let browser;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });
  }
  return browser;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Endpoint principal: recebe HTML, devolve PNG base64
// POST /render
// Body: { html: "<string>", width: 1080, height: 1350 }
// Response: { image: "<base64 png>" }
app.post('/render', async (req, res) => {
  const { html, width = 1080, height = 1350 } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Campo "html" obrigatório' });
  }

  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });

    // Aguarda imagens de fundo carregarem (background-image via CSS)
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images).map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
              })
        )
      );
    });

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });

    const base64 = screenshot.toString('base64');
    res.json({ image: base64 });

  } catch (err) {
    console.error('Erro ao renderizar slide:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`slide-renderer rodando na porta ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
