// api/donate.js
// Handles POST /api/donate
// Creates a Stripe Checkout session and returns the checkout URL
// Supports both card and Thai PromptPay QR

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL          = process.env.SITE_URL || 'https://word-fluent.vercel.app';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { method, amount } = req.body;
  // method: 'card' or 'promptpay'
  // amount: donation amount in THB (Thai Baht) — default 50

  if (!method || !['card', 'promptpay'].includes(method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const donationAmount = parseInt(amount) || 50; // default 50 THB

  try {
    // ── Build payment method types ────────────────────────────────────────────
    const paymentMethodTypes = method === 'promptpay' ? ['promptpay'] : ['card'];

    // ── Create Stripe Checkout Session ───────────────────────────────────────
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode':                         'payment',
        'payment_method_types[]':       paymentMethodTypes[0],
        'line_items[0][price_data][currency]':                   'thb',
        'line_items[0][price_data][unit_amount]':                String(donationAmount * 100), // Stripe uses smallest unit (satang)
        'line_items[0][price_data][product_data][name]':         'Donation to Word-Fluent',
        'line_items[0][price_data][product_data][description]':  'Thank you for supporting Word-Fluent!',
        'success_url': `${SITE_URL}?donated=true`,
        'cancel_url':  `${SITE_URL}?donated=cancelled`,
        'submit_type': 'donate',
        'custom_text[submit][message]': 'Your donation helps us keep Word-Fluent free for everyone.',
      }).toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json().catch(() => ({}));
      console.error('Stripe error:', err);
      return res.status(500).json({ error: 'Payment setup failed. Please try again.' });
    }

    const session = await stripeRes.json();

    return res.status(200).json({
      success:     true,
      checkoutUrl: session.url,
      sessionId:   session.id,
    });

  } catch (err) {
    console.error('Donate error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
