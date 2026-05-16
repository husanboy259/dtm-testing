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

// ── HTTP server (keeps Render alive) ─────────────────────────────────────────
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot ishlayapti!');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server 0.0.0.0:${PORT} da ishlamoqda`);
});

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function addUser(userId) {
  await supabase.from('users').upsert({ id: userId }, { onConflict: 'id' });
}

async function getAllUsers() {
  const { data } = await supabase.from('users').select('id');
  return (data || []).map(r => r.id);
}

async function loadTests() {
  const { data: tests } = await supabase.from('tests').select('*');
  if (!tests || tests.length === 0) return {};

  const result = {};
  for (const test of tests) {
    const { data: photos } = await supabase
      .from('photos')
      .select('file_id, caption, position')
      .eq('test_id', test.id)
      .order('position');

    const { data: answers } = await supabase
      .from('answers')
      .select('question_no, answer')
      .eq('test_id', test.id);

    const answersMap = {};
    (answers || []).forEach(r => { answersMap[r.question_no] = r.answer; });

    result[test.name] = {
      id:      test.id,
      name:    test.name,
      totalQ:  test.total_q,
      type:    test.type,
      photos:  (photos || []).map(p => p.file_id),
      answers: answersMap,
    };
  }
  return result;
}

async function saveTest(testName, photoFileIds, answersArr) {
  // Insert test row
  const { data: testRow, error } = await supabase
    .from('tests')
    .insert({ name: testName, total_q: answersArr.length, type: 'remote' })
    .select()
    .single();

  if (error) throw error;

  // Insert photos
  const photoRows = photoFileIds.map((file_id, i) => ({
    test_id: testRow.id, file_id, caption: null, position: i + 1,
  }));
  await supabase.from('photos').insert(photoRows);

  // Insert answers
  const answerRows = answersArr.map((answer, i) => ({
    test_id: testRow.id, question_no: i + 1, answer,
  }));
  await supabase.from('answers').insert(answerRows);
}

async function deleteTest(testName) {
  const { data } = await supabase.from('tests').select('id').eq('name', testName).single();
  if (!data) return false;
  await supabase.from('tests').delete().eq('id', data.id);
  return true;
}

// ── Bot & sessions ────────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });

const sessions      = new Map(); // userId -> { answers, currentQ, testStarted, testConfig }
const adminSessions = new Map(); // adminId -> { phase, testName, photos }

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
  }
  return sessions.get(userId);
}

// ── Keyboards ─────────────────────────────────────────────────────────────────
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
  const rows = Object.keys(tests).map(name => [{ text: `📋 ${name}`, callback_data: `test___${name}` }]);
  return { inline_keyboard: rows };
}

// ── Core helpers ──────────────────────────────────────────────────────────────
async function sendQuestion(chatId, qNum) {
  await bot.sendMessage(chatId, `❓ ${qNum}-savol uchun javob tanlang:`, {
    reply_markup: answerKeyboard(qNum),
  });
}

async function startTestSession(chatId, userId, testConfig) {
  const session = getSession(userId);
  session.answers     = {};
  session.currentQ    = 1;
  session.testStarted = true;
  session.testConfig  = testConfig;

  await bot.sendMessage(chatId, `📚 "${testConfig.name}" testi boshlanmoqda...`, {
    reply_markup: mainKeyboard(),
  });

  for (const fileId of testConfig.photos) {
    await bot.sendPhoto(chatId, fileId);
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

// ── /start ────────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  await addUser(userId);
  sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false, testConfig: null });
  await bot.sendMessage(msg.chat.id, "Salom! Testni boshlash uchun quyidagi tugmani bosing 👇", {
    reply_markup: mainKeyboard(),
  });
});

// ── /myid ─────────────────────────────────────────────────────────────────────
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 Sizning Telegram ID: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
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
    `✅ "${name}" testi yaratilmoqda.\n\n📷 Rasmlarni ketma-ket yuboring.\nTugagach /done yozing.`
  );
});

// ── /done ─────────────────────────────────────────────────────────────────────
bot.onText(/\/done/, async (msg) => {
  const adminSess = adminSessions.get(msg.from.id);
  if (!adminSess || adminSess.phase !== 'photos') return;
  if (adminSess.photos.length === 0) {
    await bot.sendMessage(msg.chat.id, '⚠️ Hech qanday rasm yuborilmadi!');
    return;
  }
  adminSess.phase = 'answers';
  await bot.sendMessage(msg.chat.id,
    `✅ ${adminSess.photos.length} ta rasm saqlandi.\n\nEndi javoblarni yuboring (probel bilan ajrating):\nMisol: A B C D A B C D A B`
  );
});

// ── /deltests <name> ──────────────────────────────────────────────────────────
bot.onText(/\/deltests (.+)/, async (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const name = match[1].trim();
  const deleted = await deleteTest(name);
  await bot.sendMessage(msg.chat.id,
    deleted ? `✅ "${name}" testi o'chirildi.` : `❌ "${name}" nomli test topilmadi.`
  );
});

// ── /listtests ────────────────────────────────────────────────────────────────
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

// ── Admin: receive photos ─────────────────────────────────────────────────────
bot.on('photo', async (msg) => {
  const adminSess = adminSessions.get(msg.from.id);
  if (!adminSess || adminSess.phase !== 'photos') return;
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  adminSess.photos.push(fileId);
  await bot.sendMessage(msg.chat.id,
    `📷 Rasm ${adminSess.photos.length} ta qabul qilindi. Davom eting yoki /done yozing.`
  );
});

// ── Admin: receive answers / user messages ────────────────────────────────────
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

  try {
    await saveTest(adminSess.testName, adminSess.photos, parts);
    await bot.sendMessage(msg.chat.id,
      `✅ "${adminSess.testName}" testi Supabase ga saqlandi!\n📊 ${parts.length} ta savol | 📷 ${adminSess.photos.length} ta rasm`
    );
  } catch (err) {
    await bot.sendMessage(msg.chat.id, `❌ Xatolik: ${err.message}`);
  }
  adminSessions.delete(msg.from.id);
});

// ── "Tests 📝" button ─────────────────────────────────────────────────────────
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
