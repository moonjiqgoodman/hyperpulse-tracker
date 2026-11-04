'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const router = useRouter();

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inputElement = passwordInputRef.current;
    if (!inputElement) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'type') {
          if (!showPassword && inputElement.type === 'text') {
            inputElement.type = 'password';
          }
        }
      });
    });

    observer.observe(inputElement, { attributes: true });
    return () => observer.disconnect();
  }, [showPassword]);

  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('light')) {
      setIsDarkMode(false);
    } else {
      setIsDarkMode(true);
      root.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.remove('dark');
      root.classList.add('light');
      setIsDarkMode(false);
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      setIsDarkMode(true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userEmail', data.email);
        router.push('/');
      } else {
        setError(data.message || 'Invalid email or password');
        setLoading(false);
      }
    } catch (err) {
      console.error('Login request error:', err);
      setError('Failed to connect to authentication server');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-background text-foreground font-sans px-4 select-none">
      
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 h-9 w-9 flex items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted transition-colors cursor-pointer shadow-xs"
        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-4 w-4" />
      </button>

      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
        
        <div className="flex flex-col items-center justify-center text-center gap-2">
          <div className="relative w-36 h-10 flex items-center justify-center">
            <Image 
              src="/ipinfra_logo.png" 
              alt="Logo" 
              fill 
              className="object-contain"
              priority
            />
          </div>
          <span className="text-[10px] tracking-widest text-foreground font-mono uppercase font-bold leading-tight">
            SATELLITE TRACKER
          </span>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="text-xs bg-destructive/10 text-destructive p-2.5 rounded-md border border-destructive/20 text-center">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email Address</label>
            <input 
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ipinfra.my"
              className="w-full bg-background text-xs font-medium text-foreground px-3 py-2 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <div className="relative">
              <input 
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-background text-xs font-medium text-foreground px-3 py-2 pr-9 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={showPassword ? "Hide password" : "Show password"}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2 px-4 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
        <div className="pt-4 border-t border-border text-center">
          <p className="text-[9px] font-mono text-muted-foreground tracking-wide">
            © IPINFRA NETWORKS SDN BHD
          </p>
        </div>
      </div>
    </div>
  );
}