import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Holding from '@/models/Holding';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();
    
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('clientId') || '994826';
    
    // Delete BHEL by ISIN
    const result = await Holding.deleteOne({ 
      clientId, 
      isin: 'INE257A01026' 
    });
    
    // Also try deleting by name in case ISIN format differs
    const resultByName = await Holding.deleteOne({ 
      clientId, 
      $or: [
        { stockName: /b\s*h\s*e\s*l/i },
        { stockName: 'B H E L' },
        { stockName: 'BHEL' }
      ]
    });
    
    const totalDeleted = (result.deletedCount || 0) + (resultByName.deletedCount || 0);
    
    if (totalDeleted > 0) {
      return NextResponse.json({
        success: true,
        message: `BHEL removed successfully. Deleted ${totalDeleted} record(s).`,
        deletedCount: totalDeleted,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'BHEL not found in holdings.',
        deletedCount: 0,
      });
    }
  } catch (error: any) {
    console.error('Error deleting BHEL:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to delete BHEL' 
      },
      { status: 500 }
    );
  }
}

