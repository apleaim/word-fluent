// api/unsubscribe.js
// Handles GET /api/unsubscribe?email=xxx
// Linked from the footer of every daily email

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

module.exports = async (req, res) => {
  const { email } = req.query;

  if (!email || !email.includes('@')) {
    return res.status(400).send(pageHTML('Invalid link', 'That unsubscribe link doesn\'t look right. Please contact us if you need help.', false));
  }

  const normalised = decodeURIComponent(email).toLowerCase().trim();

  try {
    // ── 1. Mark inactive in Supabase ─────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error: dbError } = await supabase
      .from('subscribers')
      .update({ active: false, unsubscribed_at: new Date().toISOString() })
      .eq('email', normalised);

    if (dbError) {
      console.error('Supabase unsubscribe error:', dbError.message);
      return res.status(500).send(pageHTML('Something went wrong', 'We couldn\'t process your request. Please try again.', false));
    }

    // ── 2. Remove from Brevo contact list ────────────────────────────────────
    // First get the contact ID
    const contactRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(normalised)}`, {
      headers: { 'api-key': BREVO_API_KEY, 'accept': 'application/json' },
    });

    if (contactRes.ok) {
      const contact = await contactRes.json();
      // Remove from list 2 (change to your Brevo list ID)
      await fetch(`https://api.brevo.com/v3/contacts/lists/2/contacts/remove`, {
        method: 'POST',
        headers: {
          'api-key':      BREVO_API_KEY,
          'accept':       'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ emails: [normalised] }),
      });
    }

    return res.status(200).send(pageHTML(
      'You\'ve been unsubscribed',
      'Sorry to see you go. You won\'t receive any more emails from Word-Fluent.',
      true
    ));

  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).send(pageHTML('Something went wrong', 'Please try again later.', false));
  }
};

function pageHTML(title, message, success) {
  const color = success ? '#0F6E56' : '#e24b4a';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Word-Fluent</title>
  <style>
    body { margin: 0; font-family: -apple-system, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { background: #fff; border-radius: 12px; padding: 40px 32px; max-width: 400px; text-align: center; border: 1px solid #e0e0e0; }
    .icon { font-size: 36px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 600; color: #111; margin-bottom: 10px; }
    p { font-size: 14px; color: #777; line-height: 1.6; margin-bottom: 24px; }
    a { display: inline-block; background: ${color}; color: #fff; font-size: 13px; font-weight: 600; padding: 10px 22px; border-radius: 8px; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">${success ? '✓' : '✗'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">Back to Word-Fluent</a>
  </div>
</body>
</html>`;
}
