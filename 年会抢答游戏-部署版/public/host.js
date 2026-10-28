/* 主持端逻辑 */
const socket = io();
const $ = (s) => document.querySelector(s);

const PHASE_TXT = { lobby: '准备中', question: '进行中', reveal: '已公布', finished: '已结束' };

socket.on('connect', () => socket.emit('host:hello', { origin: location.origin }));

socket.on('host:state', (st) => {
  $('#joinUrl').textContent = st.joinUrl;
  $('#qr').src = st.qr;
  $('#prog').textContent = `${st.qIndex + 1} / ${st.total}`;
  renderQRef(st.questions, st.qIndex, st.phase);
  renderStandings(st.standings);
  $('#phasePill').textContent = PHASE_TXT[st.phase] || st.phase;
  $('#cnt').textContent = st.count;
});

socket.on('lobbyUpdate', (u) => {
  $('#cnt').textContent = u.count;
  $('#ans').textContent = (u.answered !== undefined) ? u.answered : $('#ans').textContent;
  $('#prog').textContent = `${u.qIndex + 1} / ${u.total}`;
  $('#phasePill').textContent = PHASE_TXT[u.phase] || u.phase;
  // 高亮当前题（不整体重绘，避免闪烁）
  document.querySelectorAll('.qref').forEach((el) => {
    el.classList.toggle('cur', Number(el.dataset.i) === u.qIndex && u.phase !== 'lobby');
  });
});

socket.on('reveal', (rv) => {
  $('#phasePill').textContent = '已公布';
  renderStandings(rv.standings);
  // 标记当前题答案
  markAnswered(rv.index, rv.correctIndex);
});

socket.on('finished', (f) => {
  $('#phasePill').textContent = '已结束';
  renderStandings(f.standings);
});

socket.on('reset', () => {
  socket.emit('host:hello');
});

$('#btnStart').onclick = () => socket.emit('host:start');
$('#btnNext').onclick = () => socket.emit('host:next');
$('#btnReveal').onclick = () => socket.emit('host:reveal');
$('#btnFinish').onclick = () => socket.emit('host:finish');
$('#btnReset').onclick = () => { if (confirm('确定重置？所有积分清空、参与者需重新加入。')) socket.emit('host:reset'); };

function renderQRef(qs, cur, phase) {
  const box = $('#qRef');
  box.innerHTML = qs.map((q) => `
    <div class="qref ${q.i === cur && phase !== 'lobby' ? 'cur' : ''}" data-i="${q.i}">
      <div class="qt">${q.i + 1}. ${escapeHtml(q.text)}</div>
      <div class="opts">${q.options.map((o, i) => `<span>${String.fromCharCode(65 + i)}. ${escapeHtml(o)}</span>`).join('')}</div>
      <div class="ans" data-ans="${q.i}" style="display:none">正确答案：${String.fromCharCode(65 + q.answer)}</div>
    </div>`).join('');
}

function markAnswered(index, correctIndex) {
  const el = document.querySelector(`.ans[data-ans="${index}"]`);
  if (el) { el.style.display = 'block'; el.textContent = `正确答案：${String.fromCharCode(65 + correctIndex)}`; }
}

function renderStandings(list) {
  if (!list || !list.length) { $('#standings').innerHTML = '<div class="status">暂无数据</div>'; return; }
  const rows = list.map((p, i) => `
    <tr>
      <td><span class="rk">${i + 1}</span>${escapeHtml(p.name)}</td>
      <td class="score">${p.totalScore}</td>
      <td style="color:var(--muted);font-size:12px">${p.totalTime} ms</td>
    </tr>`).join('');
  $('#standings').innerHTML = `<table class="std">
    <tr><th>排名 / 名字</th><th>积分</th><th>总用时</th></tr>${rows}</table>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 本地地址打开时给出提示（手机扫不出）
(function () {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '') {
    const w = document.getElementById('localWarn');
    if (w) w.classList.remove('hidden');
  }
})();
