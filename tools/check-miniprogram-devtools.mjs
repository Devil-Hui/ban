import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const automator = require('miniprogram-automator');
const wsEndpoint = process.env.MINIPROGRAM_AUTOMATION_ENDPOINT || 'ws://127.0.0.1:9420';
const route = process.env.MINIPROGRAM_CHECK_ROUTE || '/pages/login/login';

const miniProgram = await automator.connect({ wsEndpoint });
const consoleEvents = [];
const exceptions = [];

miniProgram.on('console', (event) => consoleEvents.push(event));
miniProgram.on('exception', (event) => exceptions.push(event));

try {
  let page;
  let routeError = null;
  try {
    page = await miniProgram.reLaunch(route);
    await page.waitFor(1200);
  } catch (error) {
    routeError = { message: error.message, stack: error.stack };
  }
  const root = page ? await page.$('.login-page') : null;
  const result = {
    route: page?.path || null,
    pageStack: await miniProgram.pageStack().catch((error) => ({ error: error.message })),
    routeError,
    pageFound: Boolean(root),
    data: page ? await page.data().catch((error) => ({ error: error.message })) : null,
    consoleErrors: consoleEvents.filter((event) => ['error', 'warning'].includes(event.type)),
    exceptions,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!root || routeError || result.consoleErrors.length || exceptions.length) process.exitCode = 1;
} finally {
  miniProgram.disconnect();
}
