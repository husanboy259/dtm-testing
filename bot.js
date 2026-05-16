const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');

const TOKEN = '8960151863:AAEZikIcNIt4Fn1Jqnik7KtAUN7gPM1wYMQ';
const CHANNEL_URL = 'https://t.me/MatematikaMilliySertifikat26';
const USERS_FILE = 'users.json';

const ANSWERS = {
  1: 'A', 2: 'C', 3: 'C', 4: 'A', 5: 'C',
  6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'A',
  11: 'C', 12: 'C', 13: 'C', 14: 'B', 15: 'C',
  16: 'D', 17: 'C', 18: 'B', 19: 'C', 20: 'D',
  21: 'A', 22: 'B', 23: 'C', 24: 'C', 25: 'B',
  26: 'A', 27: 'A', 28: 'A', 29: 'C', 30: 'B',
};

const QUESTIONS = {
  1:
`1️⃣ Arifmetik progressiyada S₂₀ − S₁₉ = −30 va d = −4 bo'lsa, a₂₅ ning qiymatini toping.

A) −40
B) −50
C) −60
D) −70`,

  2:
`2️⃣ Hisoblang:
∛(5 + 2√13) + ∛(5 − 2√13)

A) ∛2
B) ¼·∛65
C) 1
D) 1,5`,

  3:
`3️⃣ 10 kishilik sinfda bitta sardor va bitta sardor yordamchisi necha xil usulda tanlanishi mumkin?

A) 100
B) 98
C) 90
D) 45`,

  4:
`4️⃣ Balandliklari bir xil bo'lgan uchta jism berilgan:
  A — konus (asos radiusi 2)
  B — silindr (asos radiusi 1,5)
  C — to'g'ri prizma (180° burchakli)

Qaysi jismga suv ko'proq ketadi?

A) A
B) B
C) C
D) Hammasiga teng`,

  5:
`5️⃣ (x³ − x² − 4x + 4) / (x² + mx + 6) kasrni qisqartirish mumkin bo'lgan m ning barcha qiymatlari yig'indisini toping.

A) 7
B) 0
C) −7
D) 9`,

  6:
`6️⃣ 3421 sonida 4 qaysi xona birligiga tegishli?

A) Birlik
B) Yuzlik
C) Minglik
D) O'nlik`,

  7:
`7️⃣ Muayyan bir ishni Salim o'zi 30 kunda, akasi Oim 20 kunda, dadasi esa 12 kunda tamomlaydi. Agar uchalasi birgalikda 2 kun ishlasa, qolgan ishni dadasi bir o'zi necha kunda tamomlaydi?

A) 7
B) 9
C) 8
D) 4`,

  8:
`8️⃣ 9ᵃ = 343 va 49ᵇ = 81 bo'lsa, a·b ni toping.

A) 1
B) 6
C) 4
D) 3`,

  9:
`9️⃣ x ∈ R son uchun x³ + 4x = 8 bo'lsa, x⁷ + 64x² ni toping.

A) 128
B) 125
C) 120
D) 100`,

  10:
`🔟 Agar (3ˣ + 6ˣ + 9ˣ) / (5ˣ + 10ˣ + 15ˣ) = 50/18 bo'lsa, x ni toping.

A) −2
B) −3
C) −4
D) −5`,

  11:
`1️⃣1️⃣ Rasmda: uchburchak ABC, tepasida E nuqtasi bor.
∠AEB = 45°, ∠D = 123°, x = ?

A) 100°
B) 101°
C) 102°
D) 103°`,

  12:
`1️⃣2️⃣ Tengsizliklar sistemasini yeching:
  ⎧ (x − 4)(x − 3) < 0
  ⎩ |7 − 2x| < 1

A) x ∈ R
B) (−4; −3) ∪ (3; 4)
C) (3; 4)
D) ∅`,

  13:
`1️⃣3️⃣ Agar a + a⁻¹ = 4 bo'lsa, a⁵ + a⁻⁵ ni toping.

A) 728
B) 726
C) 724
D) 722`,

  14:
`1️⃣4️⃣ x₁ = −4 va ikkinchi ildizi 1001 sonini eng kichik tub bo'luvchisi bo'lgan kvadrat tenglama tuzing.

A) x² − 7x − 77 = 0
B) x² − 3x − 28 = 0
C) x² − 44x = 0
D) x² − 13x − 52 = 0`,

  15:
`1️⃣5️⃣ Hisoblang:
√(1 + 2005·√(1 + 2004·√(1 + 2003·2001)))

A) 2002
B) 2003
C) 2004
D) 2005`,

  16:
`1️⃣6️⃣ Tenglamaning haqiqiy ildizlari yig'indisini toping:
1/(x²−3x−3) + 5/(x²−3x+1) = 2

A) 2
B) 3
C) 4
D) 6`,

  17:
`1️⃣7️⃣ Tenglamani yeching (davomiy kasr):

         1 + (1/5)
1 + ─────────────── = x
       5 / 5

A) 0
B) 1
C) 0,25
D) 0,5`,

  18:
`1️⃣8️⃣ 1³ + 2³ + 3³ + ... + 100³ yig'indisini 3 ga bo'lgandagi qoldiqni toping.

A) 0
B) 1
C) 2
D) −1`,

  19:
`1️⃣9️⃣ Ko'paytuvchilarga ajrating:
a⁸ − 9a⁴ + 16

A) (a⁴+4)(a²−2)(a²+2)
B) (a²−2)(a²−8)(a²+1)
C) (a⁴−a²−4)(a⁴+a²−4)
D) (a⁴−a²+4)(a⁴+a²+4)`,

  20:
`2️⃣0️⃣ c⃗(−1; 2) va a⃗(½; 1) vektorlar orasidagi burchak kosinusini toping.

A) −0,8
B) −0,6
C) 0,8
D) 0,6`,

  21:
`2️⃣1️⃣ Hisoblang:
(3/16 + 1/16) · (0,312 : 0,3 − 3,15 · 1,6)

A) −1/16
B) −3/16
C) −5/16
D) −7/16`,

  22:
`2️⃣2️⃣ Bir songa 77 ni qo'shib, 7/25 qismiga 2 qo'shsak 30 hosil bo'ladi. O'sha sonni toping.

A) 19
B) 23
C) 3
D) 37`,

  23:
`2️⃣3️⃣ Tenglamaning ildizi 8 dan qancha kam?
log₂(x + 2) + log₂(x + 3) = 1

A) 7
B) 8
C) 9
D) 10`,

  24:
`2️⃣4️⃣ Tenglamani yeching:
6 − (x−1)/2 = (3−x)/2 + (x−2)/3

A) 10,5
B) 11
C) 17
D) 18`,

  25:
`2️⃣5️⃣ 20242024·...·2024 sonini 9 ga bo'lgandagi qoldiqni natural bo'luvchilari sonini toping.

A) 0
B) 1
C) 2
D) 6`,

  26:
`2️⃣6️⃣ Silindrning yon sirti 300π, balandligi 15 bo'lsa, asos aylanasi uzunligini toping.

A) 20π
B) 30
C) 30π
D) 25`,

  27:
`2️⃣7️⃣ Soat 4:22 ni ko'rsatganda, soatning soat va minut millari orasidagi o'tkir burchakni toping.

A) 1°
B) 2°
C) 3°
D) 0°`,

  28:
`2️⃣8️⃣ 2013²⁰¹⁵ ni 10 ga bo'lgandagi qoldiqni toping.

A) 7
B) 9
C) 1
D) 3`,

  29:
`2️⃣9️⃣ Uch og'ayni birgalikda ahil yashaydi: bobosi, otasi va o'g'li.
• Boboning yoshidagi raqamlar tartibini o'zgartirsangiz — otasining yoshi chiqadi.
• Otasining yoshidagi raqamlarni qo'shsangiz — o'g'lining yoshi chiqadi.
• Uchalasining yoshi yig'indisi 144.
• Boboning yoshi 100 dan kichik va juft son.
Bobo necha yoshda?

A) 96
B) 86
C) 84
D) 76`,

  30:
`3️⃣0️⃣ Qaysi formula xato?

A) S = ½·p·r — to'rtburchak yuzi
B) ℓ = α·R — vatar uzunligi
C) S = (πR²/360°)·α — sektor yuzi
D) h = ab/c — kateti a va b bo'lgan uchburchak gipotenuazasiga tushgan balandligi`,
};

// ── Persist users ─────────────────────────────────────────────────────────────
function loadUsers() {
  try { return new Set(JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))); }
  catch (_) { return new Set(); }
}
function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify([...users]));
}
const users = loadUsers();

const bot = new TelegramBot(TOKEN, { polling: true });

// userId -> { answers, currentQ, testStarted }
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false });
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

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sendQuestion(chatId, qNum) {
  await bot.sendMessage(chatId, QUESTIONS[qNum], {
    reply_markup: answerKeyboard(qNum),
  });
}

async function startTest(chatId, userId) {
  const session = getSession(userId);
  session.answers     = {};
  session.currentQ    = 1;
  session.testStarted = true;

  await bot.sendMessage(chatId, '📋 Test boshlanmoqda... Har bir savolga A, B, C yoki D ni tanlang:', {
    reply_markup: mainKeyboard(),
  });
  await sendQuestion(chatId, 1);
}

async function showResults(chatId, userAnswers) {
  let correct = 0;
  const lines = ['📊 Natijalar:\n'];

  for (let q = 1; q <= 30; q++) {
    const userAns    = userAnswers[q] || '?';
    const correctAns = ANSWERS[q];
    const isCorrect  = userAns === correctAns;
    if (isCorrect) correct++;
    lines.push(`${isCorrect ? '✅' : '❌'} ${String(q).padStart(2)}-savol:  Siz: ${userAns}  |  To'g'ri: ${correctAns}`);
  }

  const pct = Math.round((correct / 30) * 100);
  lines.push(`\n🎯 Natija: ${correct}/30 (${pct}%)`);

  if (correct >= 25)      lines.push("🏆 Ajoyib natija!");
  else if (correct >= 20) lines.push("👍 Yaxshi natija!");
  else if (correct >= 15) lines.push("📚 Ko'proq mashq qiling!");
  else                    lines.push("💪 Harakat qiling, ko'proq o'qing!");

  lines.push("\n'Tests 📝' tugmasini bosib qayta boshlang");
  await bot.sendMessage(chatId, lines.join('\n'), { reply_markup: mainKeyboard() });
}

// ── /start ────────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  users.add(userId);
  saveUsers();

  sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false });

  await bot.sendMessage(chatId, "Salom! Testni boshlash uchun quyidagi tugmani bosing 👇", {
    reply_markup: mainKeyboard(),
  });
});

// ── "📢 Kanal" button ─────────────────────────────────────────────────────────
bot.onText(/^📢 Kanal$/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '📢 Bizning kanalimiz:', {
    reply_markup: {
      inline_keyboard: [[
        { text: '➡️ Kanalga o\'tish', url: CHANNEL_URL },
      ]],
    },
  });
});

// ── "Tests 📝" button ─────────────────────────────────────────────────────────
bot.onText(/^Tests 📝$/, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  users.add(userId);
  saveUsers();

  const session = getSession(userId);
  if (session.testStarted) {
    await bot.sendMessage(chatId, '⚠️ Test allaqachon boshlangan! Barcha savollarga javob bering.');
    return;
  }

  sessions.set(userId, { answers: {}, currentQ: 0, testStarted: false });
  await startTest(chatId, userId);
});

// ── Inline answer buttons ─────────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const userId  = query.from.id;
  const chatId  = query.message.chat.id;
  const msgId   = query.message.message_id;
  const session = getSession(userId);

  if (!query.data.startsWith('ans_')) return;

  const [, qStr, answer] = query.data.split('_');
  const qNum = parseInt(qStr, 10);

  if (session.currentQ === 0) {
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

  const isCorrect = answer === ANSWERS[qNum];

  try {
    await bot.editMessageText(
      `${isCorrect ? '✅' : '❌'} ${qNum}-savol: ${answer}`,
      { chat_id: chatId, message_id: msgId },
    );
  } catch (_) {}

  if (qNum < 30) {
    await sendQuestion(chatId, qNum + 1);
  } else {
    session.testStarted = false;
    await showResults(chatId, session.answers);
  }
});

// ── Daily 08:00 Uzbekistan time (UTC+5 → 03:00 UTC) ──────────────────────────
cron.schedule('0 3 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Kunlik xabar yuborilmoqda...`);
  for (const userId of users) {
    try {
      await bot.sendMessage(
        userId,
        `📢 Telegram kanalimizga obuna bo'ling!\n\n${CHANNEL_URL}`,
      );
    } catch (err) {
      console.warn(`Xabar yuborilmadi (${userId}): ${err.message}`);
    }
  }
}, { timezone: 'UTC' });

console.log('✅ Bot ishlamoqda...');
