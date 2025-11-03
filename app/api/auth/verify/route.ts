import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || request.nextUrl.searchParams.get('token');

    // Simple token validation (in production, verify JWT or session)
    if (token) {
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [email] = decoded.split(':');
        
        if (email === 'omprakashutaha@gmail.com') {
          return NextResponse.json({
            success: true,
            authenticated: true,
            user: {
              email: email,
            },
          });
        }
      } catch (e) {
        // Invalid token format
      }
    }

    return NextResponse.json(
      { success: false, authenticated: false },
      { status: 401 }
    );
  } catch (error: any) {
    console.error('Auth verification error:', error);
    return NextResponse.json(
      { success: false, authenticated: false },
      { status: 401 }
    );
  }
}

