// 一键建立公网通道，并自动用浏览器打开主持端大屏
const localtunnel = require('localtunnel');
const { exec } = require('child_process');

(async () => {
  console.log('正在建立公网通道，请稍候（首次会自动下载，稍慢）...');
  let tunnel;
  try {
    tunnel = await localtunnel({ port: 3000 });
  } catch (e) {
    console.error('建立通道失败：', e.message);
    console.log('请检查网络后重试，或改用部署到云的方案（见 README）。');
    process.exit(1);
  }
  const url = tunnel.url;
  console.log('');
  console.log('✅ 公网网址（主持端请用这个打开）：');
  console.log('   ' + url);
  console.log('   大屏页：' + url + '/host.html');
  console.log('');
  console.log('正在用默认浏览器打开主持端大屏…');
  try { exec('start "" "' + url + '/host.html"'); } catch (e) { /* ignore */ }
  console.log('（活动期间请勿关闭本窗口；关闭即断开公网）');

  tunnel.on('close', () => {
    console.log('通道已关闭。');
    process.exit(0);
  });
})();
