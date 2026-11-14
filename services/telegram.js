// services/telegram.js — নতুন অর্ডার এলে অ্যাডমিনের টেলিগ্রামে মেসেজ পাঠায়।
// Render Environment এ লাগবে: TG_BOT_TOKEN (বটের টোকেন), TG_CHAT_ID (তোমার চ্যাট আইডি; একাধিক হলে কমা দিয়ে)
// এখানে কোনো সমস্যা হলেও অর্ডার প্রসেস থেমে যাবে না — এরর শুধু লগে লেখা হয়।

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function send(text) {
  const token = (process.env.TG_BOT_TOKEN || '').trim();
  const chats = (process.env.TG_CHAT_ID || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!token || !chats.length) return;
  for (const chat of chats) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) console.error('Telegram send failed, status', r.status);
    } catch (e) {
      console.error('Telegram send error:', e && e.name);
    }
  }
}

const VIA = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };

// অপেক্ষা না করে ব্যাকগ্রাউন্ডে পাঠায় (await দরকার নেই)
function notifyOrder(order, user) {
  try {
    const instant = order.payMethod === 'instant';
    const lines = [
      '🛒 <b>নতুন অর্ডার</b>',
      '',
      '📦 প্যাকেজ: <b>' + esc(order.packageName) + '</b>',
      '💰 দাম: <b>' + esc(order.price) + '৳</b>',
      '🎮 Player UID: <code>' + esc(order.uid) + '</code>',
      '👤 কাস্টমার: ' + esc(user && user.name) + (user && user.email ? ' (' + esc(user.email) + ')' : ''),
      '💳 পেমেন্ট: ' + (instant ? 'Instant Pay (' + esc(VIA[order.via] || order.via) + ')' : 'Wallet'),
    ];
    if (instant) {
      lines.push('📱 Sender: ' + esc(order.senderNumber));
      lines.push('🧾 TrxID: <code>' + esc(order.trxId) + '</code>');
      lines.push(order.autoVerified ? '✅ অটো ভেরিফাইড' : '⚠️ ম্যানুয়ালি চেক করতে হবে');
    } else {
      lines.push('✅ ওয়ালেট থেকে পেইড');
    }
    lines.push('', '🕒 ' + new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }));
    send(lines.join('\n')).catch(() => {});
  } catch (e) {
    console.error('notifyOrder error:', e && e.message);
  }
}

module.exports = { notifyOrder, send };
