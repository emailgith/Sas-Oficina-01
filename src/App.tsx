/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, logout } from './firebase';
import { 
  LayoutDashboard, 
  Package, 
  FileText, 
  Users, 
  LogOut, 
  Menu, 
  X, 
  Car,
  User as UserIcon,
  Clock,
  Lock
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { OSFlow } from './pages/OSFlow';
import { Clients } from './pages/Clients';
import { History } from './pages/History';
import { Profile } from './pages/Profile';
import { Login } from './pages/Login';

// Types
export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setProfile({ uid: firebaseUser.uid, ...userDoc.data() } as UserProfile);
        } else {
          const isAdmin = firebaseUser.email === '6snailiw@gmail.com';
          const newProfile: Omit<UserProfile, 'uid'> = { 
            email: firebaseUser.email || '', 
            role: isAdmin ? 'admin' : 'user' 
          };
          
          // Create the user document in Firestore to enable rule-based checks
          try {
            await setDoc(userDocRef, newProfile);
            setProfile({ uid: firebaseUser.uid, ...newProfile } as UserProfile);
          } catch (error) {
            console.error('Error creating user profile:', error);
            // Fallback to local profile state even if DB write fails
            setProfile({ uid: firebaseUser.uid, ...newProfile } as UserProfile);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          <Route
            path="/*"
            element={
              user ? (
                <MainLayout user={user} profile={profile}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/os" element={<OSFlow profile={profile} />} />
                    <Route path="/clientes" element={<Clients profile={profile} />} />
                    <Route path="/historico" element={<History />} />
                    <Route path="/estoque" element={<Inventory profile={profile} />} />
                    <Route path="/perfil" element={<Profile profile={profile} />} />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </MainLayout>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

function MainLayout({ children, user, profile }: { children: React.ReactNode, user: User, profile: UserProfile | null }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();

  const handleAdminAccess = (e: React.MouseEvent, path: string) => {
    if (path === '/perfil') {
      e.preventDefault();
      setIsAdminAuthModalOpen(true);
    }
  };

  const verifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') {
      setIsAdminAuthModalOpen(false);
      setPin('');
      setPinError(false);
      navigate('/perfil');
    } else {
      setPinError(true);
      setPin('');
    }
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Resumo' },
    { path: '/os', icon: FileText, label: 'Nova OS' },
    { path: '/historico', icon: Clock, label: 'Histórico OS' },
    { path: '/clientes', icon: Users, label: 'Clientes' },
    { path: '/estoque', icon: Package, label: 'Estoque' },
    { path: '/perfil', icon: UserIcon, label: 'Perfil & Admin' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0B0E] flex text-[#F8F9FA]">
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-[#121418] border-r border-[#2D333B] transition-all duration-300 flex flex-col fixed inset-y-0 z-50`}
      >
        <div className="p-6 flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center shadow-lg shadow-orange-900/20">
            <Car className="w-5 h-5 text-white" />
          </div>
          {isSidebarOpen && (
            <span className="font-extrabold text-xl tracking-tighter uppercase">
              Box<span className="text-[#FF6B00]">Motors</span>
            </span>
          )}
        </div>

        <nav className="flex-1 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={(e) => handleAdminAccess(e, item.path)}
                className={`flex items-center gap-3 px-6 py-3 transition-all relative ${
                  isActive 
                    ? 'text-[#F8F9FA] bg-gradient-to-r from-[#FF6B00]/10 to-transparent border-l-4 border-[#FF6B00]' 
                    : 'text-[#9BA1A6] hover:text-[#F8F9FA] hover:bg-white/5'
                }`}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-[#FF6B00]' : ''}`} />
                {isSidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#2D333B]">
          <div className="flex items-center gap-3 px-3 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#1C1F26] border border-[#2D333B] flex items-center justify-center text-xs font-bold text-[#FF6B00]">
              {user.email?.[0].toUpperCase()}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-[#F8F9FA]">{user.email}</p>
                <span className="text-[10px] bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20 px-2 py-0.5 rounded-full uppercase font-bold">
                  {profile?.role || 'User'}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-[#9BA1A6] hover:bg-red-950/30 hover:text-[#FF4D4D] transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {isSidebarOpen && <span className="font-medium text-sm">Sair</span>}
          </button>
        </div>
      </aside>

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <header className="h-20 bg-[#0A0B0E]/80 backdrop-blur-md border-b border-[#2D333B] flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-[#1C1F26] rounded-lg transition-colors text-[#9BA1A6]"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-xl font-bold tracking-tight">Painel Administrativo</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-[#9BA1A6] uppercase tracking-widest font-bold">
                {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Admin Password Modal */}
      {isAdminAuthModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="card w-full max-w-xs p-8 relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsAdminAuthModalOpen(false)} 
              className="absolute top-4 right-4 text-[#9BA1A6] hover:text-[#F8F9FA]"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="w-16 h-16 bg-[#FF6B00]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-[#FF6B00]" />
            </div>
            
            <h2 className="text-xl font-bold text-[#F8F9FA] text-center mb-2 font-sans">Acesso Restrito</h2>
            <p className="text-[#9BA1A6] text-center text-xs mb-6 uppercase tracking-widest font-bold">Digite a senha de Admin</p>
            
            <form onSubmit={verifyPin} className="space-y-4">
              <input 
                autoFocus
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                className={`w-full bg-[#0A0B0E] border-2 ${pinError ? 'border-[#FF4D4D]' : 'border-[#2D333B]'} rounded-xl px-4 py-4 text-center text-2xl tracking-[1em] font-black text-[#F8F9FA] outline-none focus:border-[#FF6B00] transition-colors`}
                placeholder="****"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
              {pinError && <p className="text-[#FF4D4D] text-[10px] font-bold text-center uppercase tracking-wider animate-bounce">Senha incorreta!</p>}
              
              <button 
                type="submit"
                className="w-full btn-primary py-3 rounded-xl font-bold uppercase tracking-widest text-xs"
              >
                Acessar Aba
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

