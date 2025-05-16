import { type NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/mongoDB';
import Admin from '@/lib/models/admin';

// GET: Listar todos los admins
export const GET = async () => {
  try {
    await connectToDB();
    const admins = await Admin.find();
    return NextResponse.json(admins, { status: 200 });
  } catch (err) {
    console.log('[admin_GET]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

// POST: Crear un admin
export const POST = async (req: NextRequest) => {
  try {
    await connectToDB();
    const { userId, isAdmin } = await req.json();
    if (!userId) {
      return new NextResponse('Missing userId', { status: 400 });
    }
    let admin = await Admin.findOne({ userId });
    if (admin) {
      return new NextResponse('Admin already exists', { status: 400 });
    }
    admin = await Admin.create({ userId, isAdmin });
    return NextResponse.json(admin, { status: 201 });
  } catch (err) {
    console.log('[admin_POST]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

// PUT: Actualizar un admin por userId
export const PUT = async (req: NextRequest) => {
  try {
    await connectToDB();
    const { userId, isAdmin } = await req.json();
    if (!userId) {
      return new NextResponse('Missing userId', { status: 400 });
    }
    const updatedAdmin = await Admin.findOneAndUpdate(
      { userId },
      { ...(isAdmin !== undefined && { isAdmin }) },
      { new: true }
    );
    if (!updatedAdmin) {
      return new NextResponse('Admin not found', { status: 404 });
    }
    return NextResponse.json(updatedAdmin, { status: 200 });
  } catch (err) {
    console.log('[admin_PUT]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

// DELETE: Eliminar un admin por userId
export const DELETE = async (req: NextRequest) => {
  try {
    await connectToDB();
    const { userId } = await req.json();
    if (!userId) {
      return new NextResponse('Missing userId', { status: 400 });
    }
    const deletedAdmin = await Admin.findOneAndDelete({ userId });
    if (!deletedAdmin) {
      return new NextResponse('Admin not found', { status: 404 });
    }
    return NextResponse.json({ message: 'Admin deleted' }, { status: 200 });
  } catch (err) {
    console.log('[admin_DELETE]', err);
    return new NextResponse('Internal Error', { status: 500 });
  }
};

export const dynamic = 'force-dynamic';
