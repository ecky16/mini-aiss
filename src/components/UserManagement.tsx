import React, { useState, useEffect } from 'react';
import { User, Shield, ShieldCheck, Search, Loader2, Mail, Plus, X, Building2, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

import { 
  syncCompanyToSupabase, 
  syncUserToSupabase, 
  deleteCompanyFromSupabase, 
  deleteUserFromSupabase, 
  supabase 
} from '../services/supabaseService';

interface UserProfile {
  uid: string;
  email: string;
  username?: string;
  password?: string;
  role: 'admin' | 'mitra';
  name: string;
  companyId?: string;
  companyName?: string;
  isManual?: boolean;
}

export default function UserManagement({ currentUserProfile }: { currentUserProfile: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Manual Add State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'mitra'>('mitra');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [adding, setAdding] = useState(false);

  // Company Management State
  const [companies, setCompanies] = useState<{id: string, name: string}[]>([]);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    if (!supabase) return;
    setLoading(true);
    
    const { data: userData } = await supabase.from('users').select('*').order('role', { ascending: true });
    if (userData) {
      setUsers(userData.map(u => ({
        uid: u.uid,
        email: u.email,
        username: u.username,
        password: u.password,
        name: u.name,
        role: u.role,
        companyId: u.company_id,
        companyName: u.company_name
      })));
    }

    const { data: compData } = await supabase.from('companies').select('*').order('name', { ascending: true });
    if (compData) {
      setCompanies(compData);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName) return;
    setAddingCompany(true);
    try {
      const id = crypto.randomUUID();
      await syncCompanyToSupabase(id, companyName);
      setCompanyName('');
      setShowCompanyForm(false);
      await fetchData();
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
    } finally {
      setAddingCompany(false);
    }
  };

  const handleDeleteCompany = async (id: string, name: string) => {
    try {
      await deleteCompanyFromSupabase(id);
      await fetchData();
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
    }
  };

  const [confirming, setConfirming] = useState<{
    type: 'delete' | 'role',
    user?: UserProfile,
    action: () => Promise<void>
  } | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);





  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newRole === 'admin' && !newEmail) return;
    if (newRole === 'mitra' && (!newUsername || !newPassword)) return;
    if (!newName) return;
    
    setAdding(true);
    try {
      if (newRole === 'admin') {
        const existing = users.find(u => u.email?.toLowerCase() === newEmail.toLowerCase());
        if (existing) {
          setNotification({ message: "Admin dengan email ini sudah terdaftar.", type: 'error' });
          setAdding(false);
          return;
        }
      } else {
        const existing = users.find(u => u.username === newUsername);
        if (existing) {
          setNotification({ message: "Username ini sudah digunakan.", type: 'error' });
          setAdding(false);
          return;
        }
      }

      const selectedCompany = companies.find(c => c.id === newCompanyId);
      const newUser: UserProfile = {
        uid: crypto.randomUUID(),
        email: newRole === 'admin' ? newEmail.toLowerCase() : '',
        username: newRole === 'mitra' ? newUsername : '',
        password: newRole === 'mitra' ? newPassword : '',
        name: newName,
        role: newRole,
        companyId: newRole === 'mitra' ? (newCompanyId || '') : '',
        companyName: newRole === 'mitra' ? (selectedCompany?.name || '') : '',
        isManual: true
      };
      await syncUserToSupabase(newUser);
      await fetchData();

      setNewEmail('');
      setNewName('');
      setNewUsername('');
      setNewPassword('');
      setNewCompanyId('');
      setShowAddForm(false);
      setNotification({ message: "User berhasil ditambahkan", type: 'success' });
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const toggleRole = async (user: UserProfile) => {
    if (user.uid === currentUserProfile.uid) {
      setNotification({ message: "Anda tidak bisa mengubah role Anda sendiri.", type: 'error' });
      return;
    }

    const newRole = user.role === 'admin' ? 'mitra' : 'admin';
    setConfirming({
      type: 'role',
      user,
      action: async () => {
        try {
          if (!supabase) return;
          await supabase.from('users').update({ role: newRole }).eq('uid', user.uid);
          
          // If the toggled user is the current user, update localStorage
          if (user.uid === currentUserProfile.uid) {
            const updatedProfile = { ...currentUserProfile, role: newRole };
            localStorage.setItem('mini_aiss_session', JSON.stringify(updatedProfile));
          }
          
          setNotification({ message: `Role ${user.name} berhasil diubah`, type: 'success' });
          await fetchData();
        } catch (error: any) {
          setNotification({ message: error.message, type: 'error' });
        }
      }
    });
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.uid === currentUserProfile.uid) {
      setNotification({ message: "Anda tidak bisa menghapus akun Anda sendiri.", type: 'error' });
      return;
    }
    
    setConfirming({
      type: 'delete',
      user,
      action: async () => {
        try {
          await deleteUserFromSupabase(user.uid);
          setNotification({ message: `User ${user.name} berhasil dihapus`, type: 'success' });
          await fetchData();
        } catch (error: any) {
          setNotification({ message: error.message, type: 'error' });
        }
      }
    });
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 relative">
      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg border text-sm font-bold flex items-center gap-2",
              notification.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
            )}
          >
            {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-600">
                <AlertCircle className="w-8 h-8" />
                <h3 className="text-xl font-bold">Konfirmasi</h3>
              </div>
              <p className="text-slate-600">
                {confirming.type === 'delete' 
                  ? `Apakah Anda yakin ingin menghapus user ${confirming.user?.name}?`
                  : confirming.type === 'role'
                  ? `Apakah Anda yakin ingin mengubah role ${confirming.user?.name} menjadi ${confirming.user?.role === 'admin' ? 'Mitra' : 'Admin'}?`
                  : 'Apakah Anda yakin ingin melakukan sinkronisasi ulang semua data ke Supabase? Ini akan menimpa data yang ada di Supabase.'
                }
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setConfirming(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 font-bold transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    const action = confirming.action;
                    setConfirming(null);
                    await action();
                  }}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg text-white font-bold transition-all",
                    confirming.type === 'delete' ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  Ya, Lanjutkan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="text-slate-500">Kelola role Admin dan Mitra yang terdaftar</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setShowCompanyForm(!showCompanyForm); setShowAddForm(false); }}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-md"
          >
            {showCompanyForm ? <X className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
            {showCompanyForm ? 'Batal' : 'Tambah PT Mitra'}
          </button>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setShowCompanyForm(false); }}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-md"
          >
            {showAddForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {showAddForm ? 'Batal' : 'Tambah User Manual'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showCompanyForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAddCompany} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-800" /> Tambah Nama PT Mitra
              </h3>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Nama PT (Contoh: PT Telkom Indonesia)"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={addingCompany}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-8 rounded-lg transition-all disabled:bg-slate-300"
                >
                  {addingCompany ? 'Menyimpan...' : 'Simpan PT'}
                </button>
              </div>

              {companies.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Daftar PT Terdaftar:</p>
                  <div className="flex flex-wrap gap-2">
                    {companies.map(c => (
                      <div key={c.id} className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                        <span className="text-sm font-medium text-slate-700">{c.name}</span>
                        <button 
                          onClick={() => handleDeleteCompany(c.id, c.name)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </motion.div>
        )}

        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAddUser} className="bg-white border border-blue-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" /> Tambah Mitra/Admin Baru
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <input
                  type="text"
                  placeholder="Nama Lengkap"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-bold"
                >
                  <option value="mitra">Role: Mitra (User/Pass)</option>
                  <option value="admin">Role: Admin (Google Login)</option>
                </select>
                <select
                  value={newCompanyId}
                  onChange={(e) => setNewCompanyId(e.target.value)}
                  className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  disabled={newRole === 'admin'}
                  required={newRole === 'mitra'}
                >
                  <option value="">-- Pilih PT Mitra --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {newRole === 'admin' ? (
                  <input
                    type="email"
                    placeholder="Email (Wajib Google Account)"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Username Mitra"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Password Mitra"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </>
                )}
              </div>
              <button
                type="submit"
                disabled={adding}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg transition-all disabled:bg-slate-300"
              >
                {adding ? 'Menyimpan...' : 'Simpan User'}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Cari nama atau email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((user) => (
            <motion.div
              key={user.uid}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  user.role === 'admin' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                )}>
                  {user.role === 'admin' ? <ShieldCheck className="w-6 h-6" /> : <User className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900">{user.name}</h3>
                    {user.companyName && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {user.companyName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    {user.email ? (
                      <><Mail className="w-3 h-3" /> {user.email}</>
                    ) : (
                      <><User className="w-3 h-3" /> User: {user.username}</>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDeleteUser(user)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Hapus User"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <span className={cn(
                  "text-xs font-bold px-2 py-1 rounded-full uppercase",
                  user.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                )}>
                  {user.role}
                </span>
                
                <button
                  onClick={() => toggleRole(user)}
                  className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-all border border-blue-200"
                >
                  Ubah ke {user.role === 'admin' ? 'Mitra' : 'Admin'}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3">
        <Shield className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800">
          <strong>Info:</strong> User baru yang login pertama kali akan otomatis menjadi <strong>Mitra</strong>. 
          Admin utama dapat mengubah role mereka di halaman ini.
        </p>
      </div>
    </div>
  );
}
