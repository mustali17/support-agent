import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import { mockOpenRouter, restoreFetch } from './helpers.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod, app, User, Conversation, config;
let calls;

const signup = async (email = 'a@test.com', name = 'Alice') =>
  (await request(app).post('/auth/signup').send({ name, email, password: 'password1' })).body;
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const send = (token, message, conversationId) =>
  request(app).post('/chat/send').set(bearer(token)).send({ message, conversationId });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ createApp: globalThis._c } = await import('../src/app.js'));
  app = globalThis._c({ rateLimits: false });
  User = (await import('../src/models/User.js')).default;
  Conversation = (await import('../src/models/Conversation.js')).default;
  ({ config } = await import('../src/config.js'));
});
after(async () => {
  restoreFetch();
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await User.deleteMany({});
  await Conversation.deleteMany({});
  config.openrouterKey = 'test-key';
  calls = mockOpenRouter(() => ({}));
});

describe('auth', () => {
  it('signs up and returns a token without leaking the password', async () => {
    const r = await request(app).post('/auth/signup').send({ name: 'A', email: 'A@Test.com', password: 'password1' });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.email, 'a@test.com'); // normalised
    assert.equal(r.body.user.password, undefined);
  });
  it('stores the password hashed with bcrypt', async () => {
    await signup();
    const u = await User.findOne({ email: 'a@test.com' });
    assert.notEqual(u.password, 'password1');
    assert.match(u.password, /^\$2[aby]\$/);
  });
  it('rejects duplicate email (409)', async () => {
    await signup();
    const r = await request(app).post('/auth/signup').send({ name: 'B', email: 'a@test.com', password: 'password1' });
    assert.equal(r.status, 409);
  });
  it('rejects short password, bad email, missing name (400)', async () => {
    for (const body of [
      { name: 'A', email: 'a@test.com', password: 'short' },
      { name: 'A', email: 'not-an-email', password: 'password1' },
      { name: '', email: 'a@test.com', password: 'password1' },
    ]) {
      assert.equal((await request(app).post('/auth/signup').send(body)).status, 400);
    }
  });
  it('logs in with correct credentials', async () => {
    await signup();
    const r = await request(app).post('/auth/login').send({ email: 'a@test.com', password: 'password1' });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
  });
  it('rejects wrong password and unknown email with the same 401', async () => {
    await signup();
    const a = await request(app).post('/auth/login').send({ email: 'a@test.com', password: 'wrongpass1' });
    const b = await request(app).post('/auth/login').send({ email: 'x@test.com', password: 'password1' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });
  it('GET /auth/me returns the current user', async () => {
    const { token } = await signup();
    const r = await request(app).get('/auth/me').set(bearer(token));
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Alice');
  });
  it('protects routes: no token, garbage token, expired token -> 401', async () => {
    const { user } = await signup();
    const expired = jwt.sign({ sub: user.id }, 'test-secret', { expiresIn: -10 });
    const forged = jwt.sign({ sub: user.id }, 'other-secret');
    for (const route of [['get', '/chat/history'], ['post', '/chat/send'], ['get', '/auth/me'], ['post', '/auth/logout']]) {
      assert.equal((await request(app)[route[0]](route[1])).status, 401, `${route[1]} without token`);
    }
    for (const t of ['garbage', expired, forged]) {
      assert.equal((await request(app).get('/chat/history').set(bearer(t))).status, 401);
    }
  });
});

describe('chat', () => {
  it('creates a conversation and stores both messages', async () => {
    const { token } = await signup();
    const r = await send(token, 'Hello there');
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, 'echo: Hello there');
    const c = await Conversation.findById(r.body.conversationId);
    assert.deepEqual(c.messages.map((m) => [m.role, m.content]), [['user', 'Hello there'], ['assistant', 'echo: Hello there']]);
    assert.equal(c.title, 'Hello there');
  });
  it('continues an existing conversation', async () => {
    const { token } = await signup();
    const first = await send(token, 'one');
    await send(token, 'two', first.body.conversationId);
    const h = await request(app).get('/chat/history').set(bearer(token));
    assert.equal(h.body.conversations.length, 1);
    assert.equal(h.body.conversations[0].messages.length, 4);
  });
  it('sends the system prompt + earlier messages to the AI (conversation memory)', async () => {
    const { token } = await signup();
    const first = await send(token, 'My name is Sam');
    await send(token, 'What is my name?', first.body.conversationId);
    const msgs = calls.at(-1).messages;
    assert.equal(msgs[0].role, 'system');
    assert.deepEqual(msgs.slice(1).map((m) => m.content), ['My name is Sam', 'echo: My name is Sam', 'What is my name?']);
  });
  it('passes a hashed user id (not the raw one) to the AI', async () => {
    const { token, user } = await signup();
    await send(token, 'hi');
    assert.match(calls.at(-1).user, /^[0-9a-f]{32}$/);
    assert.ok(!JSON.stringify(calls.at(-1)).includes(user.id));
  });
  it('caps the context sent to the AI at 20 messages', async () => {
    const { token } = await signup();
    let id;
    for (let i = 0; i < 14; i++) id = (await send(token, `m${i}`, id)).body.conversationId;
    assert.equal(calls.at(-1).messages.length, 1 + 20);
  });
  it('history is returned newest conversation first', async () => {
    const { token } = await signup();
    await send(token, 'older');
    await new Promise((r) => setTimeout(r, 15));
    await send(token, 'newer');
    const h = await request(app).get('/chat/history').set(bearer(token));
    assert.deepEqual(h.body.conversations.map((c) => c.title), ['newer', 'older']);
  });
  it('validates input: empty, whitespace, >2000 chars, bad id', async () => {
    const { token } = await signup();
    assert.equal((await send(token, '')).status, 400);
    assert.equal((await send(token, '   ')).status, 400);
    assert.equal((await send(token, 'x'.repeat(2001))).status, 400);
    assert.equal((await send(token, 'x'.repeat(2000))).status, 200);
    assert.equal((await send(token, 'hi', 'not-an-id')).status, 400);
  });
  it('isolates users: history, sending into, and deleting another user\'s conversation', async () => {
    const a = await signup('a@test.com', 'A');
    const b = await signup('b@test.com', 'B');
    const convo = (await send(a.token, 'secret')).body.conversationId;

    const hb = await request(app).get('/chat/history').set(bearer(b.token));
    assert.deepEqual(hb.body.conversations, []);
    assert.equal((await send(b.token, 'hi', convo)).status, 404);
    assert.equal((await request(app).delete(`/chat/${convo}`).set(bearer(b.token))).status, 404);
    assert.equal((await Conversation.findById(convo).lean()).messages.length, 2); // untouched
  });
  it('deletes own conversation', async () => {
    const { token } = await signup();
    const id = (await send(token, 'bye')).body.conversationId;
    assert.equal((await request(app).delete(`/chat/${id}`).set(bearer(token))).status, 200);
    assert.equal((await request(app).get('/chat/history').set(bearer(token))).body.conversations.length, 0);
  });
});

describe('AI provider handling', () => {
  it('falls back to the next model on 429', async () => {
    const { token } = await signup();
    calls = mockOpenRouter((model) => (model === 'model-a' ? { status: 429 } : { text: 'from b' }));
    const r = await send(token, 'hi');
    assert.equal(r.body.reply, 'from b');
    assert.deepEqual(calls.map((c) => c.model), ['model-a', 'model-b']);
  });
  it('falls back when a model returns an empty reply', async () => {
    const { token } = await signup();
    calls = mockOpenRouter((model) => (model === 'model-a' ? { text: '   ' } : { text: 'from b' }));
    assert.equal((await send(token, 'hi')).body.reply, 'from b');
  });
  it('does not try other models on a non-retryable error (e.g. 401 bad key)', async () => {
    const { token } = await signup();
    calls = mockOpenRouter(() => ({ status: 401 }));
    const r = await send(token, 'hi');
    assert.equal(r.status, 502);
    assert.equal(calls.length, 1);
  });
  it('returns 502 when every model fails, but still saves the user message', async () => {
    const { token } = await signup();
    calls = mockOpenRouter(() => ({ status: 503 }));
    const r = await send(token, 'please help');
    assert.equal(r.status, 502);
    assert.equal(calls.length, 2);
    const c = await Conversation.findOne({});
    assert.deepEqual(c.messages.map((m) => m.role), ['user']);
  });
  it('returns 503 when the API key is not configured', async () => {
    const { token } = await signup();
    config.openrouterKey = '';
    assert.equal((await send(token, 'hi')).status, 503);
  });
});

describe('rate limiting', () => {
  it('limits /chat/send to 15 per minute', async () => {
    const limited = globalThis._c({ rateLimits: true });
    const { token } = (await request(limited).post('/auth/signup').send({ name: 'R', email: 'r@test.com', password: 'password1' })).body;
    let last;
    for (let i = 0; i < 16; i++) last = await request(limited).post('/chat/send').set(bearer(token)).send({ message: `m${i}` });
    assert.equal(last.status, 429);
    assert.match(last.body.error, /Slow down/);
  });
});
