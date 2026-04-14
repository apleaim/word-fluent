// api/send-daily.js
// Handles POST /api/send-daily
// Called by GitHub Actions cron job every morning
// Fetches all subscribers from Supabase and sends today's word via Brevo

const { createClient } = require('@supabase/supabase-js');

const BREVO_API_KEY  = process.env.BREVO_API_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_ANON_KEY;
const CRON_SECRET    = process.env.CRON_SECRET;       // protects this endpoint
const FROM_EMAIL     = process.env.FROM_EMAIL;        // e.g. hello@word-fluent.com or your verified Brevo sender
const SITE_URL       = process.env.SITE_URL || 'https://word-fluent.vercel.app';

// ── Word list (keep in sync with index.html) ─────────────────────────────────
const WORDS = [
  { b2: 'angry', pos: 'adjective', synonyms: [
    { word: 'irate',      ipa: '/aɪˈreɪt/',      colls: ['irate customer','irate caller'],       nuance: 'Best for situational, sudden anger in service or professional contexts.',                            example: 'The irate passenger demanded to speak to a manager after his flight was cancelled.' },
    { word: 'incensed',   ipa: '/ɪnˈsɛnst/',     colls: ['deeply incensed','incensed by/at'],    nuance: 'Conveys moral outrage — anger rooted in a sense of injustice.',                                    example: 'She was absolutely incensed by the council\'s decision to demolish the community centre.' },
    { word: 'livid',      ipa: '/ˈlɪvɪd/',       colls: ['absolutely livid','go livid'],         nuance: 'The most intense and colloquial — peak anger, often for personal betrayals.',                      example: 'He was absolutely livid when he found out his business partner had been lying.' },
    { word: 'indignant',  ipa: '/ɪnˈdɪɡnənt/',   colls: ['deeply indignant','indignant tone'],   nuance: 'Anger mixed with wounded pride. More restrained — the person feels unfairly treated.',             example: 'The professor gave an indignant response to suggestions his research lacked rigour.' },
  ]},
  { b2: 'tired', pos: 'adjective', synonyms: [
    { word: 'exhausted',  ipa: '/ɪɡˈzɔːstɪd/',   colls: ['utterly exhausted','physically exhausted'], nuance: 'Complete depletion of energy. More intense than "very tired".',                               example: 'After three nights on call, the junior doctor arrived home utterly exhausted.' },
    { word: 'fatigued',   ipa: '/fəˈtiːɡd/',      colls: ['mentally fatigued','chronic fatigue'],      nuance: 'Clinical/formal register — sustained, systemic tiredness.',                                  example: 'The study found that fatigued drivers are as dangerous as drink-drivers.' },
    { word: 'weary',      ipa: '/ˈwɪəri/',        colls: ['world-weary','grow weary of'],              nuance: 'Emotional and existential weight — long-term endurance and mild disillusionment.',            example: 'After decades in the same role, she had grown weary of the endless bureaucracy.' },
    { word: 'jaded',      ipa: '/ˈdʒeɪdɪd/',      colls: ['jaded professional','become jaded'],        nuance: 'Tired due to overexposure — lost enthusiasm. Implies cynicism.',                             example: 'Even the most jaded critics were impressed by the originality of her debut novel.' },
  ]},
  { b2: 'happy', pos: 'adjective', synonyms: [
    { word: 'elated',     ipa: '/ɪˈleɪtɪd/',      colls: ['absolutely elated','elated at the news'],   nuance: 'Intense, soaring joy in response to sudden good news. Temporary.',                          example: 'The team were elated when they heard they\'d won the contract against all odds.' },
    { word: 'content',    ipa: '/kənˈtɛnt/',       colls: ['perfectly content','content with life'],    nuance: 'Calm, settled satisfaction. Long-lasting rather than sudden.',                              example: 'He was perfectly content living alone in the cottage with his books and garden.' },
    { word: 'euphoric',   ipa: '/juːˈfɒrɪk/',      colls: ['euphoric feeling','feel euphoric'],         nuance: 'Overwhelming, almost intoxicating high — often physical in origin.',                        example: 'Crossing the finish line after 26 miles, she felt euphoric in a way she\'d never experienced.' },
    { word: 'jubilant',   ipa: '/ˈdʒuːbɪlənt/',    colls: ['jubilant crowd','jubilant celebrations'],   nuance: 'Public, expressive celebration — shared with others. Common in journalism.',                 example: 'Jubilant supporters flooded the streets outside the stadium after the final whistle.' },
  ]},
  { b2: 'sad', pos: 'adjective', synonyms: [
    { word: 'despondent',    ipa: '/dɪˈspɒndənt/',    colls: ['deeply despondent','feel despondent'],      nuance: 'Loss of hope and motivation. Often follows failure or prolonged difficulty.',              example: 'After her third rejected application, she became increasingly despondent.' },
    { word: 'melancholy',    ipa: '/ˈmɛlənkɒli/',     colls: ['deep melancholy','melancholy mood'],        nuance: 'Reflective, wistful sadness — literary, lingering, bittersweet.',                        example: 'There was a quiet melancholy to the old photographs, capturing people long since gone.' },
    { word: 'forlorn',       ipa: '/fəˈlɔːn/',        colls: ['forlorn hope','forlorn figure'],            nuance: 'Pitifully alone and abandoned — often used visually.',                                   example: 'A forlorn figure stood at the empty bus stop long after the last service had run.' },
    { word: 'disconsolate',  ipa: '/dɪsˈkɒnsələt/',   colls: ['utterly disconsolate','remain disconsolate'], nuance: 'Grief that cannot be comforted — the strongest of the four.',                        example: 'The manager sat disconsolate in the dressing room, unable to find words for his players.' },
  ]},
  { b2: 'smart', pos: 'adjective', synonyms: [
    { word: 'astute',       ipa: '/əˈstjuːt/',      colls: ['astute observer','astute businessman'],      nuance: 'Sharp practical intelligence — shrewd wisdom rather than academic brilliance.',            example: 'She was astute enough to realise the deal was too good to be true.' },
    { word: 'perceptive',   ipa: '/pəˈsɛptɪv/',     colls: ['perceptive comment','perceptive analysis'],  nuance: 'Skilled at noticing what others miss — especially nuance and hidden meaning.',            example: 'His perceptive review identified flaws that most critics had overlooked.' },
    { word: 'shrewd',       ipa: '/ʃruːd/',          colls: ['shrewd investor','shrewd move'],             nuance: 'Clever with a practical edge — often in business or politics. Slightly calculating.',    example: 'It was a shrewd move to acquire the smaller company before its value was recognised.' },
    { word: 'discerning',   ipa: '/dɪˈsɜːnɪŋ/',     colls: ['discerning taste','discerning reader'],      nuance: 'Ability to judge quality and make fine distinctions — often aesthetic.',                  example: 'The restaurant has earned a loyal following among discerning diners.' },
  ]},
  { b2: 'difficult', pos: 'adjective', synonyms: [
    { word: 'arduous',    ipa: '/ˈɑːdjuəs/',      colls: ['arduous task','arduous journey'],             nuance: 'Physically or mentally demanding over a sustained period. Implies endurance.',             example: 'The arduous trek across the mountain took three days and tested every member.' },
    { word: 'formidable', ipa: '/ˈfɔːmɪdəbl/',    colls: ['formidable challenge','formidable opponent'], nuance: 'Difficult due to scale or power — inspiring respect alongside the difficulty.',           example: 'Rebuilding public trust after the scandal proved a formidable challenge.' },
    { word: 'onerous',    ipa: '/ˈɒnərəs/',        colls: ['onerous task','onerous regulations'],         nuance: 'Burdensome, oppressive difficulty — especially legal or administrative contexts.',        example: 'Small businesses complained the new reporting requirements were unnecessarily onerous.' },
    { word: 'gruelling',  ipa: '/ˈɡruːəlɪŋ/',      colls: ['gruelling schedule','gruelling race'],        nuance: 'Exhausting to the point of being punishing — typically physical.',                       example: 'After a gruelling 14-hour shift, she arrived home too tired to eat.' },
  ]},
];

function getDayIndex() {
  const epoch = new Date('2024-01-01');
  return Math.floor((new Date() - epoch) / 86400000) % WORDS.length;
}

function buildEmailHTML(word, dateStr) {
  const synsHTML = word.synonyms.map(s => `
    <div style="border:1px solid #e0e0e0;border-radius:10px;padding:18px 20px;margin-bottom:12px;background:#fff;">
      <div style="margin-bottom:10px;">
        <span style="font-size:17px;font-weight:600;color:#111;">${s.word}</span>
        <span style="font-size:13px;color:#777;font-family:monospace;margin-left:10px;">${s.ipa}</span>
      </div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#aaa;margin-bottom:5px;">Collocations</div>
      <div style="margin-bottom:10px;">${s.colls.map(c =>
        `<span style="font-size:11px;padding:3px 10px;border-radius:99px;background:#E1F5EE;color:#0F6E56;border:1px solid #9FE1CB;margin-right:4px;margin-bottom:4px;display:inline-block;">${c}</span>`
      ).join('')}</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#aaa;margin-bottom:5px;">When to use</div>
      <p style="font-size:13px;color:#555;line-height:1.65;margin-bottom:10px;">${s.nuance}</p>
      <p style="font-size:13px;color:#111;line-height:1.65;border-left:2px solid #5DCAA5;padding-left:12px;font-style:italic;">${s.example}</p>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0e0;">

    <!-- Header -->
    <div style="background:#0F6E56;padding:24px 28px;">
      <div style="font-size:18px;font-weight:700;color:#fff;letter-spacing:-.01em;">Word-<span style="color:#9FE1CB;">Fluent</span></div>
      <div style="font-size:11px;color:#9FE1CB;margin-top:4px;letter-spacing:.06em;text-transform:uppercase;">${dateStr}</div>
    </div>

    <!-- Body -->
    <div style="padding:28px;">
      <p style="font-size:13px;color:#777;margin-bottom:20px;">Your daily B2 → C1 word upgrade</p>

      <!-- B2 word -->
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:28px;padding-bottom:22px;border-bottom:1px solid #e0e0e0;">
        <span style="font-size:11px;font-weight:600;background:#E1F5EE;color:#0F6E56;padding:3px 10px;border-radius:99px;border:1px solid #5DCAA5;">B2</span>
        <span style="font-size:30px;font-weight:700;color:#111;">${word.b2}</span>
        <span style="font-size:14px;color:#777;font-style:italic;">${word.pos}</span>
      </div>

      <!-- Synonym cards -->
      ${synsHTML}

      <!-- CTA -->
      <div style="text-align:center;margin-top:28px;padding-top:24px;border-top:1px solid #e0e0e0;">
        <a href="${SITE_URL}" style="display:inline-block;background:#0F6E56;color:#fff;font-size:13px;font-weight:600;padding:11px 24px;border-radius:8px;text-decoration:none;">Visit Word-Fluent</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f9f9f9;padding:16px 28px;border-top:1px solid #e0e0e0;text-align:center;">
      <p style="font-size:11px;color:#aaa;margin:0;">
        You're receiving this because you subscribed at word-fluent.vercel.app<br>
        <a href="${SITE_URL}/api/unsubscribe?email={{EMAIL}}" style="color:#0F6E56;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret to prevent unauthorised triggers
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  try {
    // ── 1. Get today's word ──────────────────────────────────────────────────
    const word    = WORDS[getDayIndex()];
    const dateStr = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // ── 2. Fetch all subscribers from Supabase ───────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: subscribers, error: dbError } = await supabase
      .from('subscribers')
      .select('email')
      .eq('active', true);   // only active subscribers

    if (dbError) {
      console.error('Supabase fetch error:', dbError.message);
      return res.status(500).json({ error: 'Failed to fetch subscribers' });
    }

    if (!subscribers || subscribers.length === 0) {
      return res.status(200).json({ message: 'No subscribers yet', sent: 0 });
    }

    // ── 3. Send via Brevo batch send ─────────────────────────────────────────
    const emailHTML = buildEmailHTML(word, dateStr);

    const brevoPayload = {
      sender:  { name: 'Word-Fluent', email: FROM_EMAIL },
      subject: `Your word for today: "${word.b2}" → ${word.synonyms.map(s => s.word).join(', ')}`,
      htmlContent: emailHTML,
      messageVersions: subscribers.map(sub => ({
        to: [{ email: sub.email }],
      })),
    };

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'api-key':      BREVO_API_KEY,
      },
      body: JSON.stringify(brevoPayload),
    });

    if (!brevoRes.ok) {
      const err = await brevoRes.json().catch(() => ({}));
      console.error('Brevo send error:', err);
      return res.status(500).json({ error: 'Failed to send emails', detail: err });
    }

    console.log(`Daily email sent to ${subscribers.length} subscribers — word: ${word.b2}`);
    return res.status(200).json({ success: true, sent: subscribers.length, word: word.b2 });

  } catch (err) {
    console.error('Send-daily error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
