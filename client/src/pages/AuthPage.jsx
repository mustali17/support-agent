import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { errorMessage } from '../api';

export default function AuthPage({ mode }) {
  const { login, signup } = useAuth();
  const isSignup = mode === 'signup';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isSignup) await signup(form.name, form.email, form.password);
      else await login(form.email, form.password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1>{isSignup ? 'Create account' : 'Welcome back'}</h1>
        <p className="muted">AI Customer Support</p>
        {isSignup && <input placeholder="Name" value={form.name} onChange={set('name')} required />}
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input
          type="password"
          placeholder={isSignup ? 'Password (min 8 characters)' : 'Password'}
          value={form.password}
          onChange={set('password')}
          minLength={isSignup ? 8 : undefined}
          required
        />
        {error && <div className="error">{error}</div>}
        <button disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}</button>
        <p className="muted">
          {isSignup ? (
            <>Already have an account? <Link to="/login">Log in</Link></>
          ) : (
            <>New here? <Link to="/signup">Sign up</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
