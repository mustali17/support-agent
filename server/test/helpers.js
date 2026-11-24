// Sets env BEFORE the app/config are imported (config reads env at import time).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.OPENROUTER_MODELS = 'model-a,model-b';

export const realFetch = globalThis.fetch;

/** Replace global fetch with a fake OpenRouter. `handler(model, body)` returns {status, text} */
export function mockOpenRouter(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes('openrouter.ai')) return realFetch(url, opts);
    const body = JSON.parse(opts.body);
    calls.push(body);
    const { status = 200, text = `echo: ${body.messages.at(-1).content}`, raw } = handler(body.model, body, calls.length) || {};
    if (raw) return new Response(raw, { status });
    return new Response(
      JSON.stringify(status === 200 ? { choices: [{ message: { content: text } }] } : { error: { message: 'err' } }),
      { status }
    );
  };
  return calls;
}
export const restoreFetch = () => { globalThis.fetch = realFetch; };
