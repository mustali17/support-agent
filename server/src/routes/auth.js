import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sign = (user) => jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

router.post('/signup', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    if (await User.exists({ email })) return res.status(409).json({ error: 'Email already registered' });

    const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// Stateless JWT: logout is client-side token disposal; this endpoint just acknowledges it.
router.post('/logout', requireAuth, (_req, res) => res.json({ ok: true }));

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

export default router;
