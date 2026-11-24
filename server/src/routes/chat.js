import { Router } from 'express';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import { requireAuth } from '../middleware/auth.js';
import { getAIReply } from '../utils/ai.js';

const router = Router();
router.use(requireAuth);

const MAX_MESSAGE = 2000;
const CONTEXT_MESSAGES = 20;

// POST /chat/send { message, conversationId? } -> { conversationId, title, reply }
router.post('/send', async (req, res, next) => {
  try {
    const message = String(req.body.message || '').trim();
    const { conversationId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (message.length > MAX_MESSAGE) return res.status(400).json({ error: `Message exceeds ${MAX_MESSAGE} characters` });

    let convo;
    if (conversationId) {
      if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ error: 'Invalid conversationId' });
      convo = await Conversation.findOne({ _id: conversationId, user: req.userId }); // user-scoped
      if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    } else {
      convo = new Conversation({ user: req.userId, title: message.slice(0, 60) });
    }

    convo.messages.push({ role: 'user', content: message });
    await convo.save(); // persist user message even if the AI call fails

    const context = convo.messages.slice(-CONTEXT_MESSAGES).map(({ role, content }) => ({ role, content }));
    const reply = await getAIReply(context, { userId: req.userId });

    convo.messages.push({ role: 'assistant', content: reply });
    await convo.save();

    res.json({ conversationId: convo.id, title: convo.title, reply });
  } catch (e) {
    next(e);
  }
});

// GET /chat/history -> all of the user's conversations with their messages
router.get('/history', async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ user: req.userId }).sort({ updatedAt: -1 }).lean();
    res.json({
      conversations: conversations.map((c) => ({
        id: c._id,
        title: c.title,
        updatedAt: c.updatedAt,
        messages: c.messages,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const r = await Conversation.deleteOne({ _id: req.params.id, user: req.userId });
    if (!r.deletedCount) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
