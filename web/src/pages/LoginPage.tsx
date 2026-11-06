import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { canUseGoogleSignIn } from '../lib/platform';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Eye, EyeOff, Lock, Mail, Sparkles, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { loginWithEmail, loginWithGoogle, user, shop } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  // If already logged in, redirect appropriately
  React.useEffect(() => {
    if (user) {
      if (shop?.status === 'APPROVED') {
        navigate('/dashboard');
      } else {
        navigate('/pending-approval');
      }
    }
  }, [user, shop, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please provide both email address and password');
      return;
    }

    try {
      setIsLoading(true);
      await loginWithEmail(email.trim(), password);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      setIsLoading(true);
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Google sign-in was canceled or failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/40 via-slate-50 to-rose-50/30 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Emblem */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-900 flex items-center justify-center text-amber-400 shadow-xl shadow-brand-950/20 mb-4">
          <Sparkles className="w-7 h-7" />
        </div>
        <h2 className="font-serif-display text-3xl font-extrabold text-slate-900 tracking-tight">
          YorLedger
        </h2>
        <p className="mt-1 text-sm text-slate-600 font-medium">
          {t('tagline')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 rounded-3xl border border-slate-100 sm:px-10">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-slate-900">{t('login_title')}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('login_sub')}
            </p>
          </div>

          {error && (
            <Alert type="error" message={error} className="mb-5" />
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('email')}
              type="email"
              autoComplete="email"
              placeholder="owner@shop.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />

            <div>
              <Input
                label={t('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
                required
              />
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-brand-900 focus:ring-brand-800 h-4 w-4"
                />
                {t('remember')}
              </label>

              <Link
                to="/forgot-password"
                className="font-semibold text-brand-900 hover:text-brand-700 hover:underline"
              >
                {t('forgot')}
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              {t('sign_in')}
            </Button>
          </form>

          {/* Social sign-in: website only (Google blocks its popup inside apps) */}
          {canUseGoogleSignIn && (
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm uppercase">
                <span className="bg-white px-3 text-slate-400 font-medium tracking-wider">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-300 rounded-xl bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.5.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
                  />
                </svg>
                Google Account
              </button>
            </div>
          </div>
          )}

          {/* Quick Demo Fill for evaluation */}
          <div className="mt-6 pt-5 border-t border-slate-100 bg-amber-50/50 -mx-6 -mb-8 px-6 py-4 rounded-b-3xl">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-amber-900">{t('new_shop')}</span>
              <Link
                to="/register-shop"
                className="font-bold text-brand-900 hover:text-brand-950 flex items-center gap-1"
              >
                {t('register_shop')} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link
            to="/admin-login"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            {t('admin_link')}
          </Link>
        </div>
      </div>
    </div>
  );
};

