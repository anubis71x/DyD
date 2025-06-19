import { type NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongoDB';
import Coin from '@/lib/models/token';

// GET: Listar todas las transacciones de coins
export const GET = async () => {
  try {
    await connectToDB();
    const coins = await Coin.find();
    return NextResponse.json(coins, { status: 200 });
  } catch (err) {
    console.log('[coin_GET]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

// POST: Crear una transacción de coins
export const POST = async (req: NextRequest) => {
  try {
    await connectToDB();
    const { userId, coins, usdValue } = await req.json();
    if (!userId || coins === undefined || usdValue === undefined) {
      return new NextResponse('Missing fields', { status: 400 });
    }
    const coin = await Coin.create({ userId, coins, usdValue });
    return NextResponse.json(coin, { status: 201 });
  } catch (err) {
    console.log('[coin_POST]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

// PUT: Actualizar una transacción de coins por userId
export const PUT = async (req: NextRequest) => {
  try {
    await connectToDB();
    const { userId, coins, usdValue } = await req.json();
    if (!userId) {
      return new NextResponse('Missing userId', { status: 400 });
    }
    const updatedCoin = await Coin.findOneAndUpdate(
      { userId },
      {
        ...(coins !== undefined && { coins }),
        ...(usdValue !== undefined && { usdValue }),
      },
      { new: true }
    );
    if (!updatedCoin) {
      return new NextResponse('Coin transaction not found', { status: 404 });
    }
    return NextResponse.json(updatedCoin, { status: 200 });
  } catch (err) {
    console.log('[coin_PUT]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

// DELETE: Eliminar una transacción de coins por userId
export const DELETE = async (req: NextRequest) => {
  try {
    await connectToDB();
    const { userId } = await req.json();
    if (!userId) {
      return new NextResponse('Missing userId', { status: 400 });
    }
    const deletedCoin = await Coin.findOneAndDelete({ userId });
    if (!deletedCoin) {
      return new NextResponse('Coin transaction not found', { status: 404 });
    }
    return NextResponse.json(
      { message: 'Coin transaction deleted' },
      { status: 200 }
    );
  } catch (err) {
    console.log('[coin_DELETE]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

export const dynamic = 'force-dynamic';
