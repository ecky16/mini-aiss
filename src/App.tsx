import React, { useState, useEffect } from 'react';
import { LogIn, LogOut, FileText, Loader2, HardDrive, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatBytes } from './lib/utils';
import Dashboard from './components/Dashboard';
import CreateLOP from './components/CreateLOP';
import LOPDetail from './components/LOPDetail';
import UserManagement from './components/UserManagement';

import { syncUserToSupabase, supabase, getStorageUsageFromSupabase } from './services/supabaseService';

// Types
type Role = 'admin' | 'mitra';

interface UserProfile {
  uid: string;
  email: string;
  username?: string;
  password?: string;
  role: Role;
  name: string;
  companyId?: string;
  companyName?: string;
  isManual?: boolean;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'create-lop' | 'lop-detail' | 'users'>('dashboard');
  const [selectedLopId, setSelectedLopId] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<number>(0);
  
  const [loginMode, setLoginMode] = useState<'admin' | 'mitra'>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const savedProfile = localStorage.getItem('mini_aiss_session');
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        setProfile(p);
        setUser({ uid: p.uid, email: p.email, displayName: p.name });
        fetchStorageUsage();
      }
      setLoading(false);
    };
    checkSession();
  }, []);

  const fetchStorageUsage = async () => {
    const bytes = await getStorageUsageFromSupabase();
    setStorageUsage(bytes);
  };

  const handleLogin = async () => {
    // For now, if we "forget" Firebase, we can use a simple login or Supabase Auth.
    // Since we want to keep it simple, let's use the same username/password flow for Admin too
    // or just inform the user.
    setLoginMode('mitra'); // Force mitra mode which is now the only one
  };

  const handleMitraLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not initialized');

      const { data: mitraData, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !mitraData) {
        // Try email login too if username fails
        let { data: adminData } = await supabase
          .from('users')
          .select('*')
          .eq('email', username)
          .single();

        // Jika admin belum ada di Supabase sama sekali, buatkan otomatis
        if (!adminData && username === 'eckyrahmad769@gmail.com') {
          const newAdmin = {
            uid: 'admin-' + Date.now(),
            email: username,
            username: 'admin_utama',
            password: password, // Gunakan password yang baru saja diketik
            name: 'Administrator',
            role: 'admin'
          };
          await supabase.from('users').insert(newAdmin);
          adminData = newAdmin;
        } else if (!adminData) {
          setLoginError('Username/Email tidak ditemukan.');
          setLoading(false);
          return;
        }

        // Jika password di database kosong (karena sebelumnya pakai Google Auth),
        // jadikan password yang baru diketik sebagai password permanennya.
        if (!adminData.password) {
          await supabase.from('users').update({ password: password }).eq('uid', adminData.uid);
          adminData.password = password;
        } else if (adminData.password !== password) {
          setLoginError('Password salah.');
          setLoading(false);
          return;
        }
        
        const profileData: UserProfile = {
          uid: adminData.uid,
          email: adminData.email || '',
          username: adminData.username,
          password: adminData.password,
          name: adminData.name,
          role: adminData.role as Role,
          companyId: adminData.company_id,
          companyName: adminData.company_name,
          isManual: true
        };

        setProfile(profileData);
        setUser({ uid: profileData.uid, email: profileData.email, displayName: profileData.name });
        localStorage.setItem('mini_aiss_session', JSON.stringify(profileData));
        fetchStorageUsage();
        return;
      }

      const profileData: UserProfile = {
        uid: mitraData.uid,
        email: mitraData.email || '',
        username: mitraData.username,
        password: mitraData.password,
        name: mitraData.name,
        role: mitraData.role as Role,
        companyId: mitraData.company_id,
        companyName: mitraData.company_name,
        isManual: true
      };

      setProfile(profileData);
      setUser({ uid: profileData.uid, email: profileData.email, displayName: profileData.name });
      localStorage.setItem('mini_aiss_session', JSON.stringify(profileData));
      fetchStorageUsage();
    } catch (error: any) {
      console.error('Manual login failed', error);
      setLoginError('Terjadi kesalahan saat login.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mini_aiss_session');
    setProfile(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Mini AISS</h1>
          <p className="text-slate-500 mb-8">Quality Control & Evidence Management</p>
          
          <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
            <button 
              onClick={() => setLoginMode('admin')}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                loginMode === 'admin' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Admin
            </button>
            <button 
              onClick={() => setLoginMode('mitra')}
              className={cn(
                "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                loginMode === 'mitra' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Mitra
            </button>
          </div>

          {loginMode === 'admin' ? (
            <form onSubmit={handleMitraLogin} className="space-y-4">
              <input
                type="email"
                placeholder="Email Admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              {loginError && <p className="text-xs text-red-500 text-left font-medium">{loginError}</p>}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-200"
              >
                <LogIn className="w-5 h-5" />
                Login Admin
              </button>
            </form>
          ) : (
            <form onSubmit={handleMitraLogin} className="space-y-4">
              <input
                type="text"
                placeholder="Username Mitra"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              {loginError && <p className="text-xs text-red-500 text-left font-medium">{loginError}</p>}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-slate-200"
              >
                <LogIn className="w-5 h-5" />
                Login Mitra
              </button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">Mini AISS</span>
          </div>
          
          <div className="flex items-center gap-4">
            {profile.role === 'admin' && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg mr-2">
                <HardDrive className="w-4 h-4 text-slate-500" />
                <div className="flex flex-col">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600 w-24">
                    <span>{formatBytes(storageUsage)}</span>
                    <span>1 GB</span>
                  </div>
                  <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-0.5">
                    <div 
                      className={cn("h-full rounded-full transition-all", storageUsage > 800000000 ? "bg-red-500" : storageUsage > 500000000 ? "bg-amber-500" : "bg-blue-500")}
                      style={{ width: `${Math.min((storageUsage / 1073741824) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {profile.role === 'admin' && (
              <button
                onClick={() => setView('users')}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-all",
                  view === 'users' ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Users className="w-5 h-5" />
                <span className="hidden md:inline">Users</span>
              </button>
            )}

            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-slate-900">{profile.name}</span>
              <span className="text-xs text-slate-500 capitalize">{profile.role}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <Dashboard 
              profile={profile} 
              onSelectLop={(id) => { setSelectedLopId(id); setView('lop-detail'); }}
              onCreateLop={() => setView('create-lop')}
            />
          )}
          {view === 'create-lop' && (
            <CreateLOP 
              onBack={() => setView('dashboard')} 
              onSuccess={() => setView('dashboard')}
            />
          )}
          {view === 'lop-detail' && selectedLopId && (
            <LOPDetail 
              lopId={selectedLopId} 
              profile={profile}
              onBack={() => setView('dashboard')} 
            />
          )}
          {view === 'users' && profile.role === 'admin' && (
            <UserManagement currentUserProfile={profile} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function UserManagementIcon(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("lucide lucide-users", props.className)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}

// --- Sub-components are now in separate files ---
