import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const AUDIENCE_ID = '2d6a1c17-e733-446e-a3d8-8cae269432b6';

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { email } = await req.json();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  try {
    await resend.contacts.create({ email, audienceId: AUDIENCE_ID, unsubscribed: false });
    await resend.emails.send({
      from: 'InvestRadar <onboarding@resend.dev>',
      to: email,
      subject: 'Welcome to InvestRadar 🚀',
      html: '<h2>Welcome!</h2><p>Thanks for subscribing to <strong>InvestRadar</strong>! You will receive weekly market insights and top news digests.</p><p>— The InvestRadar Team</p>'
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    return NextResponse.json({ error: 'Failed to subscribe.' }, { status: 500 });
  }
}
