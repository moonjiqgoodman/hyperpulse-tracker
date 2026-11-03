// app/api/users/route.ts
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import bcrypt from 'bcryptjs';

function generateRandomPassword(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function GET() {
  try {
    const [users]: any = await pool.query('SELECT id, email, created_at FROM users ORDER BY id ASC');
    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email.trim().toLowerCase(), passwordHash]
    );

    return NextResponse.json({ success: true, message: 'User account created successfully' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ success: false, message: 'Email is already registered' }, { status: 400 });
    }
    console.error('Failed to create user:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { targetId, actorEmail } = await request.json();
    if (!targetId || !actorEmail) {
      return NextResponse.json({ success: false, message: 'Target user ID and actor email are required' }, { status: 400 });
    }

    // Find actor in database
    const [actorRows]: any = await pool.query('SELECT * FROM users WHERE email = ?', [actorEmail.trim().toLowerCase()]);
    if (!actorRows || actorRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Unauthorized actor' }, { status: 403 });
    }
    const actor = actorRows[0];

    // Find target user
    const [targetRows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!targetRows || targetRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Target user not found' }, { status: 404 });
    }
    const target = targetRows[0];

    // Rule: Only ID 1 can reset passwords, and CANNOT reset own password
    if (actor.id !== 1) {
      return NextResponse.json({ success: false, message: 'Permission denied: Only Senior Admin (ID 1) can reset passwords.' }, { status: 403 });
    }
    if (actor.id === target.id) {
      return NextResponse.json({ success: false, message: 'Security restriction: You cannot reset your own password account.' }, { status: 403 });
    }

    const newPassword = generateRandomPassword(12);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, targetId]);

    return NextResponse.json({ success: true, newPassword });
  } catch (error) {
    console.error('Failed to reset password:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetIdStr = searchParams.get('id');
    const actorEmail = searchParams.get('actorEmail');

    if (!targetIdStr || !actorEmail) {
      return NextResponse.json({ success: false, message: 'Target ID and actor email are required' }, { status: 400 });
    }

    const targetId = parseInt(targetIdStr, 10);

    // Find actor in database
    const [actorRows]: any = await pool.query('SELECT * FROM users WHERE email = ?', [actorEmail.trim().toLowerCase()]);
    if (!actorRows || actorRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Unauthorized actor' }, { status: 403 });
    }
    const actor = actorRows[0];

    // Find target user
    const [targetRows]: any = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!targetRows || targetRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Target user not found' }, { status: 404 });
    }
    const target = targetRows[0];

    // Rule: Only ID 1 can delete users, and CANNOT delete own account or ID 1
    if (actor.id !== 1) {
      return NextResponse.json({ success: false, message: 'Permission denied: Only Senior Admin (ID 1) can delete accounts.' }, { status: 403 });
    }
    if (actor.id === target.id) {
      return NextResponse.json({ success: false, message: 'Security restriction: You cannot delete your own account.' }, { status: 403 });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [targetId]);

    return NextResponse.json({ success: true, message: 'User account deleted successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}