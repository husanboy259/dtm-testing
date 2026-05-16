const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const http = require('http');

const TOKEN      = '8960151863:AAEZikIcNIt4Fn1Jqnik7KtAUN7gPM1wYMQ';
const CHANNEL_URL = 'https://t.me/MatematikaMilliySertifikat26';
const ADMIN_ID   = 7396525906;
const USERS_FILE = 'users.json';
const TESTS_FILE = 'tests.json';
const PORT       = process.env.PORT || 3000;

// Render requires an HTTP server to keep the service alive
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot ishlayapti!');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server 0.0.0.0:${PORT} da ishlamoqda`);
});

// ── Default built-in test ────────────────────────────────────────────────────
const DEFAULT_TEST = {
  name: 'DTM Test (Asosiy)',
  type: 'local',
  totalQ: 30,
  photos: [
    { file: 'photos/q1_9.jpg',   caption: 'Savollar 1-9' },
    { file: 'photos/q10_18.jpg', caption: 'Savollar 10-18' },
    { file: 'photos/q19_28.jpg', caption: 'Savollar 19-28' },
    { file: 'photos/q29_30.jpg', caption: 'Savollar 29-30' },
  ],
  answers: {
    1: 'A', 2: 'C', 3: 'C', 4: 'A', 5: 'C',
    6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'A',
    11: 'C', 12: 'C', 13: 'C', 14: 'B', 15: 'C',
    16: 'D', 17: 'C', 18: 'B', 19: 'C', 20: 'D',
    21: 'A', 22: 'B', 23: 'C', 24: 'C', 25: 'B',
    26: 'A', 27: 'A', 28: 'A', 29: 'C', 30: 'B',
  },
};

// ── Persistence ──────────────────────────────────────────────────────────────
function loadUsers() {
  try { return new Set(JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))); }
  catch (_) { return new Set(); }
}
function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify([...users]));
}
const users = loadUsers();

function loadTests() {
  try { return JSON.parse(fs.readFileSync(TESTS_FILE, 'utf8')); }
  catch (_) { return {}; }
}
function saveTests(tests) {
  fs.writeFileSync(TESTS_FILE, JSON.stringify(tests, null, 2));
}

// ── Bot & sessions ───────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

// userId -> { answers, currentQ, testStarted, testConfig }
const sessions = new Map();
// adminId -> { phase: 'photos'|'answers', testName, photos: [] }
const adminSessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
  }
  return sessions.get(userId);
}

// ── Keyboards ────────────────────────────────────────────────────────────────
function mainKeyboard() {
  return {
    keyboard: [[{ text: 'Tests 📝' }, { text: '📢 Kanal' }]],
    resize_keyboard: true,
    persistent: true,
  };
}

function answerKeyboard(qNum) {
  return {
    inline_keyboard: [[
      { text: 'A', callback_data: `ans_${qNum}_A` },
      { text: 'B', callback_data: `ans_${qNum}_B` },
      { text: 'C', callback_data: `ans_${qNum}_C` },
      { text: 'D', callback_data: `ans_${qNum}_D` },
    ]],
  };
}

function testListKeyboard() {
  const tests = loadTests();
  const rows = [
    [{ text: `📋 ${DEFAULT_TEST.name}`, callback_data: 'test___default' }],
    ...Object.keys(tests).map(name => [{ text: `📋 ${name}`, callback_data: `test___${name}` }]),
  ];
  return { inline_keyboard: rows };
}

// ── Core helpers ─────────────────────────────────────────────────────────────
async function sendQuestion(chatId, qNum) {
  await bot.sendMessage(chatId, `❓ ${qNum}-savol uchun javob tanlang:`, {
    reply_markup: answerKeyboard(qNum),
  });
}

async function startTestSession(chatId, userId, testConfig) {
  const session = getSession(userId);
  session.answers    = {};
  session.currentQ   = 1;
  session.testStarted = true;
  session.testConfig  = testConfig;

  await bot.sendMessage(chatId, `📚 "${testConfig.name}" testi boshlanmoqda...`, {
    reply_markup: mainKeyboard(),
  });

  if (testConfig.type === 'local') {
    for (const { file, caption } of testConfig.photos) {
      if (fs.existsSync(file)) {
        await bot.sendPhoto(chatId, fs.createReadStream(file), { caption });
      }
    }
  } else {
    for (const fileId of testConfig.photos) {
      await bot.sendPhoto(chatId, fileId);
    }
  }

  await bot.sendMessage(
    chatId,
    `📋 Barcha ${testConfig.totalQ} ta savol yuqorida.\nHar bir savol uchun A, B, C yoki D ni tanlang:`,
  );
  await sendQuestion(chatId, 1);
}

async function showResults(chatId, session) {
  const { answers: userAnswers, testConfig } = session;
  let correct = 0;
  const lines = [`📊 "${testConfig.name}" natijalari:\n`];

  for (let q = 1; q <= testConfig.totalQ; q++) {
    const userAns    = userAnswers[q] || '?';
    const correctAns = testConfig.answers[q];
    const isCorrect  = userAns === correctAns;
    if (isCorrect) correct++;
    lines.push(`${isCorrect ? '✅' : '❌'} ${String(q).padStart(2)}-savol:  Siz: ${userAns}  |  To'g'ri: ${correctAns}`);
  }

  const pct = Math.round((correct / testConfig.totalQ) * 100);
  lines.push(`\n🎯 Natija: ${correct}/${testConfig.totalQ} (${pct}%)`);

  if (pct >= 83)      lines.push('🏆 Ajoyib natija!');
  else if (pct >= 67) lines.push("👍 Yaxshi natija!");
  else if (pct >= 50) lines.push("📚 Ko'proq mashq qiling!");
  else                lines.push("💪 Harakat qiling, ko'proq o'qing!");

  lines.push("\n'Tests 📝' tugmasini bosib qayta boshlang");
  await bot.sendMessage(chatId, lines.join('\n'), { reply_markup: mainKeyboard() });
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  users.add(userId);
  saveUsers();
  sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
  await bot.sendMessage(msg.chat.id, "Salom! Testni boshlash uchun quyidagi tugmani bosing 👇", {
    reply_markup: mainKeyboard(),
  });
});

// ── /myid — show Telegram ID (needed to set ADMIN_ID) ────────────────────────
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Sizning Telegram ID: \`${msg.from.id}\``, {
    parse_mode: 'Markdown',
  });
});

// ── /addtest <name> ───────────────────────────────────────────────────────────
bot.onText(/\/addtest (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) {
    await bot.sendMessage(msg.chat.id, '⛔ Siz admin emassiz.');
    return;
  }

  const name = match[1].trim();
  adminSessions.set(msg.from.id, { phase: 'photos', testName: name, photos: [] });
  await bot.sendMessage(msg.chat.id,
    `✅ "${name}" testi yaratilmoqda.\n\n` +
    `📷 Rasmlarni ketma-ket yuboring.\n` +
    `Tugagach /done yozing.`
  );
});

// ── /done — finish photo phase, request answers ───────────────────────────────
bot.onText(/\/done/, async (msg) => {
  const adminSess = adminSessions.get(msg.from.id);
  if (!adminSess || adminSess.phase !== 'photos') return;
  if (adminSess.photos.length === 0) {
    await bot.sendMessage(msg.chat.id, '⚠️ Hech qanday rasm yuborilmadi!');
    return;
  }
  adminSess.phase = 'answers';
  await bot.sendMessage(msg.chat.id,
    `✅ ${adminSess.photos.length} ta rasm saqlandi.\n\n` +
    `Endi javoblarni yuboring (probel bilan ajrating):\n` +
    `Misol: A B C D A B C D A B`
  );
});

// ── /deltests <name> — delete a test ────────────────────────────────────────
bot.onText(/\/deltests (.+)/, async (msg, match) => {
  if (!ADMIN_ID || msg.from.id !== ADMIN_ID) return;
  const name = match[1].trim();
  const tests = loadTests();
  if (!tests[name]) {
    await bot.sendMessage(msg.chat.id, `❌ "${name}" nomli test topilmadi.`);
    return;
  }
  delete tests[name];
  saveTests(tests);
  await bot.sendMessage(msg.chat.id, `✅ "${name}" testi o'chirildi.`);
});

// ── /listtests — list all tests ───────────────────────────────────────────────
bot.onText(/\/listtests/, async (msg) => {
  if (!ADMIN_ID || msg.from.id !== ADMIN_ID) return;
  const tests = loadTests();
  const names = Object.keys(tests);
  if (names.length === 0) {
    await bot.sendMessage(msg.chat.id, "📋 Qo'shimcha testlar yo'q.");
    return;
  }
  const list = names.map((n, i) => `${i + 1}. ${n} (${tests[n].totalQ} savol)`).join('\n');
  await bot.sendMessage(msg.chat.id, `📋 Testlar:\n\n${list}`);
});

// ── Photo messages (admin adding photos) ─────────────────────────────────────
bot.on('photo', async (msg) => {
  const adminSess = adminSessions.get(msg.from.id);
  if (!adminSess || adminSess.phase !== 'photos') return;
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  adminSess.photos.push(fileId);
  await bot.sendMessage(msg.chat.id,
    `📷 Rasm ${adminSess.photos.length} ta qabul qilindi. Davom eting yoki /done yozing.`
  );
});

// ── Text messages (admin answers entry) ──────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text) return;
  const adminSess = adminSessions.get(msg.from.id);
  if (!adminSess || adminSess.phase !== 'answers') return;
  if (msg.text.startsWith('/')) return;

  const parts = msg.text.trim().toUpperCase().split(/\s+/);
  const valid = parts.every(p => ['A', 'B', 'C', 'D'].includes(p));
  if (!valid) {
    await bot.sendMessage(msg.chat.id,
      '⚠️ Faqat A, B, C, D harflarini yuboring (probel bilan ajratilgan).\nMisol: A B C D A B'
    );
    return;
  }

  const answers = {};
  parts.forEach((ans, i) => { answers[i + 1] = ans; });

  const tests = loadTests();
  tests[adminSess.testName] = {
    name: adminSess.testName,
    type: 'remote',
    photos: adminSess.photos,
    answers,
    totalQ: parts.length,
  };
  saveTests(tests);

  const { testName, photos } = adminSess;
  adminSessions.delete(msg.from.id);

  await bot.sendMessage(msg.chat.id,
    `✅ "${testName}" testi saqlandi!\n` +
    `📊 ${parts.length} ta savol | 📷 ${photos.length} ta rasm`
  );
});

// ── "Tests 📝" button ─────────────────────────────────────────────────────────
bot.onText(/^Tests 📝$/, async (msg) => {
  const userId = msg.from.id;
  users.add(userId);
  saveUsers();

  const session = getSession(userId);
  if (session.testStarted) {
    await bot.sendMessage(msg.chat.id, '⚠️ Test allaqachon boshlangan! Barcha savollarga javob bering.');
    return;
  }

  const extraTests = loadTests();
  sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });

  if (Object.keys(extraTests).length === 0) {
    await startTestSession(msg.chat.id, userId, DEFAULT_TEST);
  } else {
    await bot.sendMessage(msg.chat.id, '📚 Qaysi testni boshlash istaysiz?', {
      reply_markup: testListKeyboard(),
    });
  }
});

// ── "📢 Kanal" button ─────────────────────────────────────────────────────────
bot.onText(/^📢 Kanal$/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '📢 Bizning kanalimiz:', {
    reply_markup: {
      inline_keyboard: [[{ text: "➡️ Kanalga o'tish", url: CHANNEL_URL }]],
    },
  });
});

// ── Callback queries ──────────────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const session = getSession(userId);

  // Test selection from list
  if (query.data.startsWith('test___')) {
    const testName = query.data.replace('test___', '');
    await bot.answerCallbackQuery(query.id);

    let testConfig;
    if (testName === 'default') {
      testConfig = DEFAULT_TEST;
    } else {
      const tests = loadTests();
      testConfig = tests[testName];
      if (!testConfig) {
        await bot.sendMessage(chatId, '❌ Test topilmadi.');
        return;
      }
    }

    try { await bot.editMessageReplyMarkup({}, { chat_id: chatId, message_id: msgId }); } catch (_) {}
    sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
    await startTestSession(chatId, userId, testConfig);
    return;
  }

  // Answer buttons
  if (query.data.startsWith('ans_')) {
    const [, qStr, answer] = query.data.split('_');
    const qNum = parseInt(qStr, 10);

    if (!session.testStarted || session.currentQ === 0) {
      await bot.answerCallbackQuery(query.id, {
        text: "Testni boshlash uchun 'Tests 📝' tugmasini bosing",
        show_alert: true,
      });
      return;
    }

    if (qNum !== session.currentQ) {
      await bot.answerCallbackQuery(query.id, {
        text: 'Bu savol allaqachon javob berilgan!',
        show_alert: true,
      });
      return;
    }

    await bot.answerCallbackQuery(query.id);

    session.answers[qNum] = answer;
    session.currentQ = qNum + 1;

    const isCorrect = answer === session.testConfig.answers[qNum];
    try {
      await bot.editMessageText(
        `${isCorrect ? '✅' : '❌'} ${qNum}-savol: ${answer}`,
        { chat_id: chatId, message_id: msgId },
      );
    } catch (_) {}

    if (qNum < session.testConfig.totalQ) {
      await sendQuestion(chatId, qNum + 1);
    } else {
      session.testStarted = false;
      await showResults(chatId, session);
    }
  }
});

// ── Daily 08:00 Uzbekistan time (UTC+5 → 03:00 UTC) ──────────────────────────
cron.schedule('0 3 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Kunlik xabar yuborilmoqda...`);
  for (const userId of users) {
    try {
      await bot.sendMessage(userId, `📢 Telegram kanalimizga obuna bo'ling!\n\n${CHANNEL_URL}`);
    } catch (err) {
      console.warn(`Xabar yuborilmadi (${userId}): ${err.message}`);
    }
  }
}, { timezone: 'UTC' });

console.log('✅ Bot ishlamoqda...');
