/* 参与者端逻辑 */
const socket = io();
const $ = (s) => document.querySelector(s);

let me = { name: null, joined: false, answered: false, currentIndex: -1, qStart: 0, timer: null };

$('#joinBtn').onclick = () => {
  const name = $('#nameInput').value.trim();
  if (!name) { alert('请输入名字'); return; }
  me.name = name;
  socket.emit('join', { name });
};

$('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinBtn').click(); });

socket.on('joined', ({ name }) => {
  me.joined = true;
  $('#whoName').textContent = name;
  $('#joinScreen').classList.add('hidden');
  $('#gameScreen').classList.remove('hidden');
  renderStatus('等待主持开始第一题…');
});

socket.on('question', (q) => {
  me.currentIndex = q.index;
  me.qStart = q.start;
  me.answered = false;
  $('#board').classList.add('hidden');
  renderQuestion(q);
  startTimer();
});

socket.on('result', (r) => {
  stopTimer();
  // 标记个人选项对错
  if (!r.missed && r.choice != null) {
    const chosen = document.querySelector(`.opt[data-i="${r.choice}"]`);
    if (chosen) chosen.classList.add('chosen');
  }
  const opts = document.querySelectorAll('.opt');
  opts.forEach((el) => {
    const i = Number(el.dataset.i);
    el.classList.add('dim');
    el.onclick = null;
    if (i === r.correctIndex) el.classList.add('correct');
  });
  const line = document.getElementById('resultLine');
  if (line) {
    if (r.missed) { line.textContent = '本题未作答'; line.className = 'result-line no'; }
    else if (r.correct) { line.textContent = `答对啦！+${r.pointsThisQ} 分`; line.className = 'result-line ok'; }
    else { line.textContent = '答错了，下次加油'; line.className = 'result-line no'; }
  }
  $('#myScore').textContent = r.totalScore;
  renderStatus('已公布答案，等待下一题…');
});

socket.on('reveal', (rv) => {
  if (rv.leaderboard && rv.leaderboard.length) {
    const list = $('#boardList');
    list.innerHTML = rv.leaderboard.map((p) => `
      <div class="row">
        <span class="rk">${p.rank}</span>
        <span class="nm">${escapeHtml(p.name)}</span>
        <span class="tm">${p.rt} ms${p.points ? ' · +' + p.points : ''}</span>
      </div>`).join('');
    $('#board').classList.remove('hidden');
  }
});

socket.on('finished', (f) => {
  stopTimer();
  renderStatus('🏁 抢答结束！最终排行榜');
  renderFinal(f.standings);
});

socket.on('reset', () => {
  stopTimer();
  me = { name: me.name, joined: true, answered: false, currentIndex: -1, qStart: 0, timer: null };
  $('#board').classList.add('hidden');
  $('#questionArea').innerHTML = '';
  renderStatus('新一轮已开始，等待第一题…');
});

function renderQuestion(q) {
  const tags = ['A', 'B', 'C', 'D', 'E', 'F'];
  $('#questionArea').innerHTML = `
    <div class="q-card">
      <div class="q-meta">
        <span>第 ${q.index + 1} 题</span>
        <span class="timer" id="timer">0.0s</span>
      </div>
      <div class="q-text">${escapeHtml(q.text)}</div>
      <div class="options">
        ${q.options.map((o, i) => `
          <button class="opt" data-i="${i}">
            <span class="tag">${tags[i]}</span>${escapeHtml(o)}
          </button>`).join('')}
      </div>
      <div class="status" id="resultLine" style="margin-top:14px;display:none"></div>
    </div>`;
  const line = document.getElementById('resultLine');
  if (line) line.style.display = 'none';
  document.querySelectorAll('.opt').forEach((el) => {
    el.onclick = () => submitAnswer(Number(el.dataset.i), el);
  });
}

function submitAnswer(choice, el) {
  if (me.answered) return;
  me.answered = true;
  socket.emit('answer', { qIndex: me.currentIndex, choice });
  document.querySelectorAll('.opt').forEach((b) => { b.onclick = null; b.classList.add('dim'); });
  el.classList.remove('dim');
  el.classList.add('chosen');
  const line = document.getElementById('resultLine');
  if (line) { line.textContent = '已提交，等待公布…'; line.className = 'result-line'; line.style.display = 'block'; }
}

function renderStatus(text) {
  const s = $('#statusArea');
  if (!document.querySelector('.q-card')) {
    s.innerHTML = `<div class="status">${text}</div>`;
  }
}

function renderFinal(standings) {
  const top = standings.slice(0, 30).map((p, i) => `
    <div class="row">
      <span class="rk">${i + 1}</span>
      <span class="nm">${escapeHtml(p.name)}</span>
      <span class="tm">${p.totalScore} 分</span>
    </div>`).join('');
  $('#questionArea').innerHTML = `
    <div class="board" style="margin-top:0">
      <h3>🏆 最终排行榜（同分看速度）</h3>
      <div>${top}</div>
    </div>`;
}

function startTimer() {
  stopTimer();
  me.timer = setInterval(() => {
    const t = (Date.now() - me.qStart) / 1000;
    const el = document.getElementById('timer');
    if (el) el.textContent = t.toFixed(1) + 's';
  }, 100);
}
function stopTimer() { if (me.timer) { clearInterval(me.timer); me.timer = null; } }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
