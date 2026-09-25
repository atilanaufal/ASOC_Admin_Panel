import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Logout successful.',
  });

  // Delete all admin panel cookies
  response.cookies.delete('asoc_admin_session');
  response.cookies.delete('asoc_admin_token');
  // Also clean up any legacy cookies
  response.cookies.delete('auth_session');
  response.cookies.delete('better-auth.session_token');
  response.cookies.delete('__Secure-better-auth.session_token');

  return response;
}
