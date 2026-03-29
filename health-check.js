const { execSync } = require('child_process');

function getStatus() {
  try {
    const out = execSync('pm2 jlist', { encoding: 'utf8' });
    const list = JSON.parse(out);
    const app = list.find(a => a.name === 'fitsorted');
    if (!app) return { status: 'missing' };
    return { status: app.pm2_env.status || 'unknown' };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

console.log(JSON.stringify(getStatus()));
