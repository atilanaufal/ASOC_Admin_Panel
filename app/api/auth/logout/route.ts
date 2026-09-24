import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Logout successful.',
  });

  response.cookies.delete('auth_session');
  response.cookies.delete('better-auth.session_token');
  response.cookies.delete('__Secure-better-auth.session_token');

  return response;
}
