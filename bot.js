const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const TOKEN       = '8960151863:AAEZikIcNIt4Fn1Jqnik7KtAUN7gPM1wYMQ';
const CHANNEL_URL = 'https://t.me/MatematikaMilliySertifikat26';
const ADMIN_ID    = 7396525906;
const PORT        = process.env.PORT || 3000;

const SUPABASE_URL = 'https://nmggpreomednuxvplzmn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZ2dwcmVvbWVkbnV4dnBsem1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDM4ODIsImV4cCI6MjA5NDUxOTg4Mn0.1yNBxMyv2gZVBRvXY7drmYF8w_XxnsjYu-KbWmvpX_Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── HTTP server (keeps Render alive) ──────────────────────────────────────────
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot ishlayapti!');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server 0.0.0.0:${PORT} da ishlamoqda`);
});

// ── Supabase helpers ───────────────────────────────────────────────────────────
async function addUser(userId) {
  await supabase.from('users').upsert({ id: userId }, { onConflict: 'id' });
}

async function getAllUsers() {
  const { data } = await supabase.from('users').select('id');
  return (data || []).map(r => r.id);
}

async function loadTests() {
  const { data: tests, error } = await supabase.from('tests').select('*');
  if (error) { console.error('loadTests error:', error.message); return {}; }
  if (!tests || tests.length === 0) return {};

  const result = {};
  for (const test of tests) {
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('test_id', test.id)
      .order('question_no');

    const qMap = {};
    (questions || []).forEach(q => {
      qMap[q.question_no] = {
        question:    q.question,
        option_a:    q.option_a,
        option_b:    q.option_b,
        option_c:    q.option_c,
        option_d:    q.option_d,
        correct_ans: q.correct_ans,
      };
    });

    result[test.name] = {
      id:        test.id,
      name:      test.name,
      totalQ:    test.total_q,
      questions: qMap,
    };
  }
  return result;
}

async function saveTest(testName, questions) {
  const { data: testRow, error } = await supabase
    .from('tests')
    .insert({ name: testName, total_q: questions.length, type: 'text' })
    .select()
    .single();
  if (error) throw error;

  const rows = questions.map((q, i) => ({
    test_id:     testRow.id,
    question_no: i + 1,
    question:    q.question,
    option_a:    q.option_a,
    option_b:    q.option_b,
    option_c:    q.option_c,
    option_d:    q.option_d,
    correct_ans: q.correct_ans,
  }));
  const { error: qErr } = await supabase.from('questions').insert(rows);
  if (qErr) throw qErr;
}

async function deleteTest(testName) {
  const { data } = await supabase.from('tests').select('id').eq('name', testName).single();
  if (!data) return false;
  await supabase.from('tests').delete().eq('id', data.id);
  return true;
}

// ── Parse one question block sent by admin ────────────────────────────────────
// Expected format (each question as one message):
//   Savol matni
//   A) Variant A
//   B) Variant B
//   C) Variant C
//   D) Variant D
//   Javob: A
function parseQuestion(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const idx = {
    a: lines.findIndex(l => /^A\)/i.test(l)),
    b: lines.findIndex(l => /^B\)/i.test(l)),
    c: lines.findIndex(l => /^C\)/i.test(l)),
    d: lines.findIndex(l => /^D\)/i.test(l)),
    j: lines.findIndex(l => /^Javob:/i.test(l)),
  };

  if (Object.values(idx).some(i => i === -1)) return null;

  const correct = lines[idx.j].replace(/^Javob:\s*/i, '').toUpperCase().trim();
  if (!['A', 'B', 'C', 'D'].includes(correct)) return null;

  return {
    question:    lines.slice(0, idx.a).join('\n'),
    option_a:    lines[idx.a].replace(/^A\)\s*/i, ''),
    option_b:    lines[idx.b].replace(/^B\)\s*/i, ''),
    option_c:    lines[idx.c].replace(/^C\)\s*/i, ''),
    option_d:    lines[idx.d].replace(/^D\)\s*/i, ''),
    correct_ans: correct,
  };
}

// ── Bot & sessions ─────────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

// userId -> { answers, currentQ, testStarted, testConfig }
const sessions = new Map();
// adminId -> { phase: 'questions', testName, questions: [] }
const adminSessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
  }
  return sessions.get(userId);
}

// ── Keyboards ──────────────────────────────────────────────────────────────────
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

async function testListKeyboard() {
  const tests = await loadTests();
  const rows = Object.keys(tests).map(name => [
    { text: `📋 ${name}`, callback_data: `test___${name}` },
  ]);
  return { inline_keyboard: rows };
}

// ── Core helpers ───────────────────────────────────────────────────────────────
async function sendQuestion(chatId, qNum, testConfig) {
  const q = testConfig.questions[qNum];
  const text =
    `❓ *${qNum}-savol:*\n\n` +
    `${q.question}\n\n` +
    `🅰 ${q.option_a}\n` +
    `🅱 ${q.option_b}\n` +
    `🅲 ${q.option_c}\n` +
    `🅳 ${q.option_d}`;

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: answerKeyboard(qNum),
  });
}

async function startTestSession(chatId, userId, testConfig) {
  const session = getSession(userId);
  session.answers     = {};
  session.currentQ    = 1;
  session.testStarted = true;
  session.testConfig  = testConfig;

  await bot.sendMessage(
    chatId,
    `📚 *"${testConfig.name}"* testi boshlanmoqda...\nJami: ${testConfig.totalQ} ta savol`,
    { parse_mode: 'Markdown', reply_markup: mainKeyboard() },
  );
  await sendQuestion(chatId, 1, testConfig);
}

async function showResults(chatId, session) {
  const { answers: userAnswers, testConfig } = session;
  let correct = 0;
  const lines = [`📊 *"${testConfig.name}"* natijalari:\n`];

  for (let q = 1; q <= testConfig.totalQ; q++) {
    const userAns    = userAnswers[q] || '?';
    const correctAns = testConfig.questions[q].correct_ans;
    const isCorrect  = userAns === correctAns;
    if (isCorrect) correct++;
    lines.push(`${isCorrect ? '✅' : '❌'} ${String(q).padStart(2)}-savol:  Siz: *${userAns}*  |  To'g'ri: *${correctAns}*`);
  }

  const pct = Math.round((correct / testConfig.totalQ) * 100);
  lines.push(`\n🎯 Natija: *${correct}/${testConfig.totalQ}* (${pct}%)`);

  if (pct >= 83)      lines.push('🏆 Ajoyib natija!');
  else if (pct >= 67) lines.push("👍 Yaxshi natija!");
  else if (pct >= 50) lines.push("📚 Ko'proq mashq qiling!");
  else                lines.push("💪 Harakat qiling, ko'proq o'qing!");

  lines.push("\n'Tests 📝' tugmasini bosib qayta boshlang");
  await bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: mainKeyboard(),
  });
}

// ── /start ─────────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  await addUser(userId);
  sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
  await bot.sendMessage(msg.chat.id, "Salom! Testni boshlash uchun quyidagi tugmani bosing 👇", {
    reply_markup: mainKeyboard(),
  });
});

// ── /myid ──────────────────────────────────────────────────────────────────────
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Sizning Telegram ID: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
});

// ── /addtest <name> ────────────────────────────────────────────────────────────
bot.onText(/\/addtest (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) {
    await bot.sendMessage(msg.chat.id, '⛔ Siz admin emassiz.');
    return;
  }
  const name = match[1].trim();
  adminSessions.set(msg.from.id, { phase: 'questions', testName: name, questions: [] });
  await bot.sendMessage(
    msg.chat.id,
    `✅ *"${name}"* testi yaratilmoqda.\n\n` +
    `Har bir savolni quyidagi formatda yuboring:\n\n` +
    `\`Savol matni\n` +
    `A) Variant A\n` +
    `B) Variant B\n` +
    `C) Variant C\n` +
    `D) Variant D\n` +
    `Javob: A\`\n\n` +
    `Tugagach /done yozing.`,
    { parse_mode: 'Markdown' },
  );
});

// ── /done ──────────────────────────────────────────────────────────────────────
bot.onText(/\/done/, async (msg) => {
  const adminSess = adminSessions.get(msg.from.id);
  if (!adminSess) return;
  if (adminSess.questions.length === 0) {
    await bot.sendMessage(msg.chat.id, '⚠️ Hech qanday savol qo\'shilmadi!');
    return;
  }
  try {
    await saveTest(adminSess.testName, adminSess.questions);
    await bot.sendMessage(
      msg.chat.id,
      `✅ *"${adminSess.testName}"* testi saqlandi!\n📊 ${adminSess.questions.length} ta savol`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    await bot.sendMessage(msg.chat.id, `❌ Xatolik: ${err.message}`);
  }
  adminSessions.delete(msg.from.id);
});

// ── /deltests <name> ───────────────────────────────────────────────────────────
bot.onText(/\/deltests (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const name = match[1].trim();
  const deleted = await deleteTest(name);
  await bot.sendMessage(
    msg.chat.id,
    deleted ? `✅ "${name}" testi o'chirildi.` : `❌ "${name}" nomli test topilmadi.`,
  );
});

// ── /listtests ─────────────────────────────────────────────────────────────────
bot.onText(/\/listtests/, async (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const tests = await loadTests();
  const names = Object.keys(tests);
  if (names.length === 0) {
    await bot.sendMessage(msg.chat.id, "📋 Hech qanday test yo'q.");
    return;
  }
  const list = names.map((n, i) => `${i + 1}. ${n} (${tests[n].totalQ} savol)`).join('\n');
  await bot.sendMessage(msg.chat.id, `📋 Testlar:\n\n${list}`);
});

// ── Incoming text — admin question entry ───────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const adminSess = adminSessions.get(msg.from.id);
  if (!adminSess || adminSess.phase !== 'questions') return;

  const parsed = parseQuestion(msg.text);
  if (!parsed) {
    await bot.sendMessage(
      msg.chat.id,
      '⚠️ Format noto\'g\'ri! Iltimos quyidagi formatda yuboring:\n\n' +
      '`Savol matni\nA) ...\nB) ...\nC) ...\nD) ...\nJavob: A`',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  adminSess.questions.push(parsed);
  await bot.sendMessage(
    msg.chat.id,
    `✅ ${adminSess.questions.length}-savol qabul qilindi.\n\nKeyingi savolni yuboring yoki /done yozing.`,
  );
});

// ── "Tests 📝" button ──────────────────────────────────────────────────────────
bot.onText(/^Tests 📝$/, async (msg) => {
  const userId = msg.from.id;
  await addUser(userId);

  const session = getSession(userId);
  if (session.testStarted) {
    await bot.sendMessage(msg.chat.id, '⚠️ Test allaqachon boshlangan! Barcha savollarga javob bering.');
    return;
  }

  const tests = await loadTests();
  sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });

  if (Object.keys(tests).length === 0) {
    await bot.sendMessage(msg.chat.id, "⚠️ Hozircha hech qanday test yo'q. Admin tez orada qo'shadi!");
    return;
  }

  await bot.sendMessage(msg.chat.id, '📚 Qaysi testni boshlash istaysiz?', {
    reply_markup: await testListKeyboard(),
  });
});

// ── "📢 Kanal" button ──────────────────────────────────────────────────────────
bot.onText(/^📢 Kanal$/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '📢 Bizning kanalimiz:', {
    reply_markup: {
      inline_keyboard: [[{ text: "➡️ Kanalga o'tish", url: CHANNEL_URL }]],
    },
  });
});

// ── Callback queries ───────────────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const userId  = query.from.id;
  const chatId  = query.message.chat.id;
  const msgId   = query.message.message_id;
  const session = getSession(userId);

  if (query.data.startsWith('test___')) {
    const testName = query.data.replace('test___', '');
    await bot.answerCallbackQuery(query.id);
    const tests = await loadTests();
    const testConfig = tests[testName];
    if (!testConfig) {
      await bot.sendMessage(chatId, '❌ Test topilmadi.');
      return;
    }
    try { await bot.editMessageReplyMarkup({}, { chat_id: chatId, message_id: msgId }); } catch (_) {}
    sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
    await startTestSession(chatId, userId, testConfig);
    return;
  }

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

    const isCorrect = answer === session.testConfig.questions[qNum].correct_ans;
    try {
      await bot.editMessageText(
        `${isCorrect ? '✅' : '❌'} ${qNum}-savol: *${answer}*`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' },
      );
    } catch (_) {}

    if (qNum < session.testConfig.totalQ) {
      await sendQuestion(chatId, qNum + 1, session.testConfig);
    } else {
      session.testStarted = false;
      await showResults(chatId, session);
    }
  }
});

// ── Daily 08:00 UZT (UTC+5 → 03:00 UTC) ──────────────────────────────────────
cron.schedule('0 3 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Kunlik xabar yuborilmoqda...`);
  const userIds = await getAllUsers();
  for (const userId of userIds) {
    try {
      await bot.sendMessage(userId, `📢 Telegram kanalimizga obuna bo'ling!\n\n${CHANNEL_URL}`);
    } catch (err) {
      console.warn(`Xabar yuborilmadi (${userId}): ${err.message}`);
    }
  }
}, { timezone: 'UTC' });

console.log('✅ Bot ishlamoqda...');
