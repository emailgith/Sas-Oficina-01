import React from 'react';
import { signInWithGoogle } from '../firebase';
import { Car } from 'lucide-react';

export function Login() {
  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, we can ignore this safely
        return;
      }
      console.error('Authentication error:', error);
      alert('Ocorreu um erro ao tentar entrar. Por favor, tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0B0E] flex items-center justify-center p-4">
      <div className="max-w-md w-full card p-10 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FF6B00] to-[#0085FF]"></div>
        
        <div className="w-20 h-20 bg-[#121418] border border-[#2D333B] rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl">
          <Car className="w-12 h-12 text-[#FF6B00]" />
        </div>
        
        <h1 className="text-4xl font-extrabold text-[#F8F9FA] mb-2 tracking-tighter uppercase">
          Box<span className="text-[#FF6B00]">Motors</span>
        </h1>
        <p className="text-[#9BA1A6] text-sm mb-10 font-medium tracking-wide uppercase">SaaS de Gestão Automotiva</p>
        
        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-4 bg-[#F8F9FA] text-[#0A0B0E] py-4 px-6 rounded-xl font-bold hover:bg-white transition-all active:scale-95 shadow-xl shadow-white/5"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          Acessar com Google
        </button>
        
        <div className="mt-12 pt-8 border-t border-[#2D333B]">
          <p className="text-[10px] text-[#9BA1A6] uppercase tracking-widest font-bold">
            Sistema Restrito • Box Motors v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
