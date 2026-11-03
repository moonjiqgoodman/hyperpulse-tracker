// app/users/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faUsers, 
  faUserPlus, 
  faKey, 
  faTrash, 
  faCheckCircle, 
  faExclamationTriangle,
  faSun,
  faMoon,
  faRightFromBracket,
  faShareNodes,
  faCopy,
  faShieldHalved,
  faBars
} from '@fortawesome/free-solid-svg-icons';
import Sidebar from '@/components/sidebar';

interface UserAccount {
  id: number;
  email: string;
  created_at: string;
}

interface TelemetryLog {
  id: number;
  terminal_id: string;
  latitude: number;
  longitude: number;
  address: string;
  recorded_at: string;
}

export default function UserManagementPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // New User Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Modal / Feedback State
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tempCredentials, setTempCredentials] = useState<{ email: string; pass: string } | null>(null);
  
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const router = useRouter();

  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated');
    const userEmail = localStorage.getItem('userEmail');
    if (!auth) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
      if (userEmail) setCurrentUserEmail(userEmail);
    }
  }, [router]);

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

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userEmail');
    router.push('/login');
  };

  const fetchData = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }

      const logRes = await fetch('/api/webhook/myriota');
      const logData = await logRes.json();
      if (Array.isArray(logData)) {
        setTelemetryLogs(logData);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
  }, [isAuthenticated]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setMessage({ type: 'error', text: 'Email and password are required.' });
      return;
    }

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Account for ${email} created successfully!` });
        setEmail('');
        setPassword('');
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to create user.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  const handleResetPassword = async (userId: number, userEmail: string) => {
    if (!currentUserEmail) return;
    if (!confirm(`Are you sure you want to reset password for ${userEmail}?`)) return;

    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: userId, actorEmail: currentUserEmail }),
      });

      const data = await res.json();
      if (data.success) {
        setTempCredentials({ email: userEmail, pass: data.newPassword });
        setMessage({ type: 'success', text: `Password reset successfully for ${userEmail}.` });
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to reset password.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  const handleDeleteUser = async (userId: number, userEmail: string) => {
    if (!currentUserEmail) return;
    if (!confirm(`Are you sure you want to delete user ${userEmail}?`)) return;

    try {
      const res = await fetch(`/api/users?id=${userId}&actorEmail=${encodeURIComponent(currentUserEmail)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `User ${userEmail} deleted successfully.` });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to delete user.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  const handleShareCredentials = (credEmail: string, credPass: string) => {
    const text = `Hi, your Hyperpulse tracker account has been updated.\nEmail: ${credEmail}\nPassword: ${credPass}\nPlease login and change your password securely.`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Hyperpulse Account Credentials',
        text: text,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      alert('Credentials copied to clipboard!');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground font-sans">
        <p className="text-xs font-mono text-muted-foreground animate-pulse">Checking session...</p>
      </div>
    );
  }

  // Find logged in user info from list if available
  const loggedInUserObj = users.find(u => u.email.toLowerCase() === currentUserEmail?.toLowerCase());
  const isActorSeniorAdmin = loggedInUserObj ? loggedInUserObj.id === 1 : false;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar 
        devices={telemetryLogs} 
        selectedDevice={null} 
        onSelectDevice={() => router.push('/')} 
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <main className="flex-1 h-full overflow-y-auto flex flex-col">
        {/* Top Header Bar */}
<header className="h-14 border-b border-border bg-card/30 backdrop-blur px-4 md:px-6 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Menu Button */}
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Toggle Menu"
            >
              <FontAwesomeIcon icon={faBars} className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <FontAwesomeIcon icon={faUsers} className="text-primary text-[11px]" />
              <span className="hidden sm:inline">User Management</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={handleLogout}
              className="h-8 px-2.5 flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors cursor-pointer shrink-0"
              title="Sign Out"
            >
              <FontAwesomeIcon icon={faRightFromBracket} className="h-3 w-3" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 p-4 md:p-6 max-w-4xl w-full mx-auto space-y-6">
          {message && (
            <div className={`p-3 rounded-md text-xs font-medium border flex items-center justify-between ${
              message.type === 'success' 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={message.type === 'success' ? faCheckCircle : faExclamationTriangle} className="h-3.5 w-3.5 shrink-0" />
                <span>{message.text}</span>
              </div>
              <button onClick={() => setMessage(null)} className="text-[10px] opacity-70 hover:opacity-100 font-mono">Dismiss</button>
            </div>
          )}

          {tempCredentials && (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faKey} /> New Credentials Generated for {tempCredentials.email}
                </span>
                <button 
                  onClick={() => setTempCredentials(null)} 
                  className="text-[10px] text-muted-foreground hover:text-foreground font-mono"
                >
                  Close
                </button>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-background/80 p-3 rounded-md border border-border">
                <div className="font-mono text-xs">
                  <div><span className="text-muted-foreground">Email:</span> {tempCredentials.email}</div>
                  <div><span className="text-muted-foreground">New Password:</span> <span className="text-foreground font-bold">{tempCredentials.pass}</span></div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tempCredentials.pass);
                      alert('Password copied!');
                    }}
                    className="px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
                    <span>Copy Password</span>
                  </button>
                  <button
                    onClick={() => handleShareCredentials(tempCredentials.email, tempCredentials.pass)}
                    className="px-3 py-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faShareNodes} className="h-3 w-3" />
                    <span>Share Details</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section 1: Add New User Form */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Add New Administrator Account
            </h2>

            <form onSubmit={handleCreateUser} className="border border-border rounded-lg bg-card p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="user@ipinfra.com.my"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-background text-xs text-foreground px-3 py-2 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Initial Password</label>
                  <input
                    type="text"
                    required
                    placeholder="****************"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-background text-xs text-foreground px-3 py-2 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <FontAwesomeIcon icon={faUserPlus} className="h-3 w-3" />
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Existing Users List */}
          <div className="space-y-2 pt-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Registered Accounts ({users.length})
            </h2>

            <div className="border border-border rounded-lg bg-card overflow-hidden">
              {loading ? (
                <div className="p-6 text-center text-xs font-mono text-muted-foreground animate-pulse">
                  Loading users...
                </div>
              ) : users.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No accounts found.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {users.map((user) => {
                    const isSeniorAdmin = user.id === 1;
                    const isSelf = user.email.toLowerCase() === currentUserEmail?.toLowerCase();
                    // Restriction rules: 
                    // 1. Cannot reset or delete own account.
                    // 2. Only Senior Admin (ID 1) can perform actions on others.
                    const canModify = isActorSeniorAdmin && !isSelf;

                    return (
                      <div key={user.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground font-mono">{user.email}</span>
                            {isSelf && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                                You
                              </span>
                            )}
                            {isSeniorAdmin && (
                              <span 
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold tracking-wide"
                                title="Senior Administrator (Protected)"
                              >
                                <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3 text-amber-500" />
                                <span>Protected</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono mt-0.5 block">
                            Created: {new Date(user.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Reset Password Button */}
                          <button
                            onClick={() => handleResetPassword(user.id, user.email)}
                            disabled={!canModify}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 shrink-0 ${
                              !canModify
                                ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground border border-border'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer'
                            }`}
                            title={isSelf ? "You cannot reset your own password here" : (!isActorSeniorAdmin ? "Only ID 1 can reset passwords" : "Reset password to random string")}
                          >
                            <FontAwesomeIcon icon={faKey} className="h-3 w-3" />
                            <span>Reset Password</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            disabled={!canModify || isSeniorAdmin}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 shrink-0 ${
                              (!canModify || isSeniorAdmin)
                                ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground border border-border' 
                                : 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 cursor-pointer'
                            }`}
                            title={isSelf ? "You cannot delete your own account" : (isSeniorAdmin ? "Senior admin account cannot be deleted" : (!isActorSeniorAdmin ? "Only ID 1 can delete accounts" : "Delete account"))}
                          >
                            <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}