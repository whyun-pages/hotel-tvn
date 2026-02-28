import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());
const url = "https://platform.censys.io/search?q=host.services.endpoints.http.body%3A+%22%2Fiptv%2Flive%2F%22+and+host.location.country_code%3A+%22CN%22&_cb=5f3928";
export async function fetchPageWithPlaywright(url: string): Promise<string> {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
  
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    //   await page.waitForTimeout(8000);
      const content = await page.content();
      return content;
    } catch (e) {
      console.error(`Playwright fetch failed: ${url}`, e);
      return "";
    } finally {
      await browser.close();
    }
  }

  fetchPageWithPlaywright(url).then(data => {
    console.log(data);
  }).catch(e => {
    console.error(`Fetch failed: ${url}`, e);
  });