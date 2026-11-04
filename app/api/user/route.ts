import { auth } from '@clerk/nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongoDB';
import User from '@/lib/models/User';

export const GET = async () => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    await connectToDB();
    let user = await User.findOne({ userId });

    // Si el usuario no existe, se le asignan puntos por primera vez
    if (!user) {
      try {
        user = await User.create({
          userId,
          availablePoints: 15
        });
      } catch (createError: any) {
        console.log('[user_CREATE]', createError);

        if (createError?.code === 11000) {
          user = await User.findOne({ userId });
          if (!user) {
            return new NextResponse('Error creating user points', {
              status: 500,
            });
          }
        } else {
          throw createError;
        }
      }
    }

    return NextResponse.json(user, { status: 200 });
  } catch (err) {
    console.log('[user_GET]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

export const POST = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    await connectToDB();
    // New accounts always start with the standard grant (same as GET).
    let user = await User.findOne({ userId });

    if (!user) {
      user = await User.create({ userId, availablePoints: 15 });
    } else {
      return new NextResponse('User already exist', {
        status: 400,
      });
    }

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.log('[user_POST]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

// Coin balances change only on the server (turn debits, purchases), never
// from the browser. This route only updates profile flags.
export const PUT = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    await connectToDB();
    const { isNewUser } = await req.json();

    if (typeof isNewUser !== 'boolean') {
      return new NextResponse('Missing data to update', { status: 400 });
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId },
      { isNewUser },
      { new: true, upsert: true }
    );

    return NextResponse.json(updatedUser, { status: 200 });
  } catch (err) {
    console.log('[user_PUT]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

export const dynamic = 'force-dynamic';
