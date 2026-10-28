/**
 * 年会实时抢答服务端
 * - 参与者：手机扫码打开页面 → 输入名字加入 → 实时收到题目 → 点选项作答
 * - 主持端：控制 开始/下一题/公布答案/结束/重置，实时看积分榜
 * - 计分：每题「答对最快的前 N 名」各得 pointsPerCorrect 分；同分按总答题速度（快者靠前）
 */
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

// ===== 可配置项 =====
const CONFIG = {
  port: process.env.PORT || 3000,
  pointsPerCorrect: 10,     // 每题答对得分
  topN: 10,                 // 每题仅最快前 N 名正确者得分
  onlyTopNScore: false,     // false=所有答对者都得满分；true=只给每题最快前N名得分
  questionTimeLimitMs: 0,   // 0=不自动收，由主持点「公布答案」收题
};

// ===== 读取题库 =====
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
} catch (e) {
  console.error('读取 questions.json 失败:', e.message);
}
if (!Array.isArray(questions) || questions.length === 0) {
  console.warn('⚠️ 题库为空，请编辑 questions.json');
}

// ===== 基础服务 =====
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

// ===== 运行状态 =====
const state = {
  participants: new Map(), // socketId -> { id, name, totalScore, totalTime }
  qIndex: -1,
  phase: 'lobby',          // lobby | question | reveal | finished
  questionStart: 0,
  answers: {},             // qIndex -> Map(socketId -> { choice, rt, correct })
};

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}
const LAN_IP = getLanIp();
const JOIN_URL = `http://${LAN_IP}:${CONFIG.port}/`;

function currentQuestion() {
  return (state.qIndex >= 0 && state.qIndex < questions.length) ? questions[state.qIndex] : null;
}

function getStandings(limit) {
  const arr = Array.from(state.participants.values()).map(p => ({
    name: p.name, totalScore: p.totalScore, totalTime: p.totalTime,
  }));
  arr.sort((a, b) => (b.totalScore - a.totalScore) || (a.totalTime - b.totalTime));
  return limit ? arr.slice(0, limit) : arr;
}

function emitLobby() {
  io.emit('lobbyUpdate', {
    count: state.participants.size,
    phase: state.phase,
    qIndex: state.qIndex,
    total: questions.length,
    answered: state.phase === 'question' ? (state.answers[state.qIndex] || new Map()).size : undefined,
  });
}

function broadcastQuestion() {
  const q = currentQuestion();
  if (!q) return;
  state.phase = 'question';
  state.questionStart = Date.now();
  state.answers[state.qIndex] = new Map();
  io.emit('question', {
    index: state.qIndex,
    text: q.text,
    options: q.options,
    start: state.questionStart,
  });
  emitLobby();
}

function revealQuestion() {
  const q = currentQuestion();
  if (!q || state.phase !== 'question') return;
  state.phase = 'reveal';
  const map = state.answers[state.qIndex] || new Map();

  // 累计答题用时（用于同分提速）
  for (const [sid, a] of map.entries()) {
    const p = state.participants.get(sid);
    if (p) p.totalTime += a.rt;
  }

  // 正确者按用时升序
  const correctList = [];
  for (const [sid, a] of map.entries()) {
    if (a.correct) {
      correctList.push({ sid, name: state.participants.get(sid)?.name || '?', rt: a.rt });
    }
  }
  correctList.sort((x, y) => x.rt - y.rt);

  // 确定本題得分者
  let scorers = correctList;
  if (CONFIG.onlyTopNScore) {
    scorers = correctList.slice(0, CONFIG.topN);
    const cutoff = scorers.length ? scorers[scorers.length - 1].rt : null;
    for (let i = CONFIG.topN; i < correctList.length; i++) {
      if (correctList[i].rt === cutoff) scorers.push(correctList[i]); else break;
    }
  }
  const scorerIds = new Set(scorers.map(s => s.sid));
  for (const s of scorers) {
    const p = state.participants.get(s.sid);
    if (p) p.totalScore += CONFIG.pointsPerCorrect;
  }

  // 本題最快前 N 名榜（给大屏/个人看）
  const perQLeaderboard = correctList.slice(0, CONFIG.topN).map((s, i) => ({
    rank: i + 1, name: s.name, rt: s.rt,
    points: scorerIds.has(s.sid) ? CONFIG.pointsPerCorrect : 0,
  }));

  // 广播给主持端
  io.emit('reveal', {
    index: state.qIndex,
    correctIndex: q.answer,
    leaderboard: perQLeaderboard,
    standings: getStandings(50),
  });

  // 逐个给参与者发个人结果
  for (const [sid, a] of map.entries()) {
    const p = state.participants.get(sid);
    io.to(sid).emit('result', {
      index: state.qIndex,
      choice: a.choice,
      correct: a.correct,
      correctIndex: q.answer,
      pointsThisQ: scorerIds.has(sid) ? CONFIG.pointsPerCorrect : 0,
      totalScore: p ? p.totalScore : 0,
    });
  }
  // 本题没作答的人也给个结果
  for (const [sid, p] of state.participants.entries()) {
    if (!map.has(sid)) {
      io.to(sid).emit('result', {
        index: state.qIndex, choice: null, correct: false,
        correctIndex: q.answer, pointsThisQ: 0, totalScore: p.totalScore, missed: true,
      });
    }
  }
  emitLobby();
}

function finishGame() {
  state.phase = 'finished';
  io.emit('finished', { standings: getStandings(state.participants.size) });
  emitLobby();
}

// ===== Socket 事件 =====
io.on('connection', (socket) => {

  // 参与者加入
  socket.on('join', ({ name }) => {
    const clean = (name || '').toString().trim().slice(0, 16) || ('来宾' + Math.floor(Math.random() * 900 + 100));
    state.participants.set(socket.id, { id: socket.id, name: clean, totalScore: 0, totalTime: 0 });

    if (state.phase === 'question') {
      const q = currentQuestion();
      socket.emit('question', { index: state.qIndex, text: q.text, options: q.options, start: state.questionStart, resume: true });
    } else if (state.phase === 'reveal') {
      const q = currentQuestion();
      const a = (state.answers[state.qIndex] || new Map()).get(socket.id);
      socket.emit('reveal', { index: state.qIndex, correctIndex: q.answer, leaderboard: [], standings: getStandings(20) });
      if (a) socket.emit('result', { index: state.qIndex, choice: a.choice, correct: a.correct, correctIndex: q.answer, pointsThisQ: 0, totalScore: state.participants.get(socket.id).totalScore });
    } else if (state.phase === 'finished') {
      socket.emit('finished', { standings: getStandings(state.participants.size) });
    }
    socket.emit('joined', { name: clean });
    emitLobby();
  });

  // 参与者作答
  socket.on('answer', ({ qIndex, choice }) => {
    if (state.phase !== 'question' || qIndex !== state.qIndex) return;
    const p = state.participants.get(socket.id);
    if (!p) return;
    const map = state.answers[state.qIndex] || (state.answers[state.qIndex] = new Map());
    if (map.has(socket.id)) return; // 只能答一次
    const q = currentQuestion();
    const rt = Date.now() - state.questionStart;
    map.set(socket.id, { choice, rt, correct: choice === q.answer });
    socket.emit('answered', { ok: true, qIndex });
    emitLobby();
  });

  // 主持端握手
  socket.on('host:hello', async ({ origin } = {}) => {
    // 优先用主持端自身打开的地址（支持公网/隧道部署），否则退回局域网地址
    const base = (origin && /^https?:\/\//.test(origin)) ? origin.replace(/\/$/, '') : JOIN_URL.replace(/\/$/, '');
    const joinUrl = base + '/';
    let qr = '';
    try { qr = await QRCode.toDataURL(joinUrl, { width: 260, margin: 1, color: { dark: '#0057B8', light: '#ffffff' } }); } catch (e) {}
    socket.emit('host:state', {
      phase: state.phase,
      qIndex: state.qIndex,
      total: questions.length,
      joinUrl,
      qr,
      questions: questions.map((q, i) => ({ i, text: q.text, answer: q.answer })),
      standings: getStandings(50),
      count: state.participants.size,
    });
  });

  socket.on('host:start', () => {
    if (state.phase === 'lobby' || state.qIndex === -1) {
      state.qIndex = 0;
      broadcastQuestion();
    }
  });
  socket.on('host:next', () => {
    if (state.qIndex < questions.length - 1) { state.qIndex++; broadcastQuestion(); }
  });
  socket.on('host:reveal', () => revealQuestion());
  socket.on('host:finish', () => finishGame());
  socket.on('host:reset', () => {
    state.participants.clear();
    state.answers = {};
    state.qIndex = -1;
    state.phase = 'lobby';
    io.emit('reset');
    emitLobby();
  });

  socket.on('disconnect', () => {
    state.participants.delete(socket.id);
    emitLobby();
  });
});

server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log('========================================');
  console.log(' 年会抢答已启动');
  console.log(' 参与者扫码地址:', JOIN_URL);
  console.log(' 主持端地址    :', `http://${LAN_IP}:${CONFIG.port}/host.html`);
  console.log(' 本机回环      :', `http://localhost:${CONFIG.port}/`);
  console.log(' 提示          : 酒店/公共网络怕设备隔离，建议用隧道或部署到公网；');
  console.log('                用公网网址打开 host.html，二维码会自动指向该公网地址。');
  console.log(' 题库题数      :', questions.length);
  console.log('========================================');
});
