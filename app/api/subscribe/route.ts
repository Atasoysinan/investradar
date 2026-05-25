import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }

  try {
    const audienceData = await resend.audiences.list();
    const audienceId = audienceData.data?.data?.[0]?.id;
    if (!audienceId) throw new Error('No audience found');

    await resend.contacts.create({
      email,
      audienceId,
      unsubscribed: false,
    });

    await resend.emails.send({
      from: 'InvestRadar <onboarding@resend.dev>',
      to: email,
      subject: 'Welcome to InvestRadar 🚀',
      html: '<h2>Welcome!</h2><p>Thanks for subscribing to <strong>InvestRadar</strong>! You will receive weekly market insights and top news digests straight to your inbox.</p><p>— The InvestRadar Team</p>',
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Resend error:', err);
    return NextResponse.json({ error: 'Failed to subscribe.' }, { status: 500 });
  }
}
