// 用 cloudflared 建立公网通道（npx 自动下载，无需手动下 exe），并自动打开主持端大屏
const { spawn } = require('child_process');
const { exec } = require('child_process');

console.log('正在通过 cloudflared 建立公网通道（首次会自动下载，稍慢，请耐心等待）...');
// 用 shell:true 让 Windows 能找到 npx.cmd（否则报 ENOENT）
const child = spawn('npx -y cloudflared tunnel --url http://localhost:3000', {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let opened = false;
function handle(data) {
  const s = data.toString();
  process.stdout.write(s);
  if (!opened) {
    const m = s.match(/https:\/\/[^\s"']+\.trycloudflare\.com/);
    if (m) {
      opened = true;
      const url = m[0].replace(/\/$/, '');
      console.log('');
      console.log('✅ 公网网址（主持端请用这个打开）：' + url);
      console.log('   大屏页：' + url + '/host.html');
      console.log('正在用浏览器打开主持端大屏…（手机扫码直接进，不用输密码）');
      try { exec('start "" "' + url + '/host.html"'); } catch (e) { /* ignore */ }
    }
  }
}
child.stdout.on('data', handle);
child.stderr.on('data', handle);
child.on('close', (code) => { console.log('\n通道已关闭。'); process.exit(0); });
child.on('error', (e) => { console.error('启动 cloudflared 失败：', e.message); process.exit(1); });
