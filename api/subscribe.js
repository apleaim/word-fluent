// api/subscribe.js
// Handles POST /api/subscribe
// Adds email to Brevo contact list AND Supabase subscribers table

const { createClient } = require('@supabase/supabase-js');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY;

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  // Basic email validation
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const normalised = email.toLowerCase().trim();

  try {
    // ── 1. Save to Supabase ──────────────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { error: dbError } = await supabase
      .from('subscribers')
      .upsert({ email: normalised, subscribed_at: new Date().toISOString() }, {
        onConflict: 'email',   // silently ignore duplicate emails
        ignoreDuplicates: true,
      });

    if (dbError) {
      console.error('Supabase error:', dbError.message);
      return res.status(500).json({ error: 'Database error. Please try again.' });
    }

    // ── 2. Add to Brevo contact list ─────────────────────────────────────────
    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'api-key':      BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: normalised,
        listIds: [2],          // ← change 2 to your Brevo list ID
        updateEnabled: true,   // update contact if already exists
        attributes: {
          SUBSCRIBED_AT: new Date().toISOString(),
        },
      }),
    });

    // 204 = already exists but updated, 201 = newly created — both are fine
    if (!brevoRes.ok && brevoRes.status !== 204) {
      const brevoBody = await brevoRes.json().catch(() => ({}));
      // If duplicate contact, Brevo returns 400 with code "duplicate_parameter" — that's fine
      if (brevoBody.code !== 'duplicate_parameter') {
        console.error('Brevo error:', brevoBody);
        return res.status(500).json({ error: 'Email service error. Please try again.' });
      }
    }

    return res.status(200).json({ success: true, message: 'Subscribed successfully!' });

  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
