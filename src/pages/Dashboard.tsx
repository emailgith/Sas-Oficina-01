import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Users, AlertCircle, TrendingUp, DollarSign, ArrowUpRight, Plus, Download, CheckCircle2, X } from 'lucide-react';

import { useNavigate, Link } from 'react-router-dom';

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  saldo_devedor: number;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [debtors, setDebtors] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ message: string, type: 'warning' } | null>(null);
  const [stats, setStats] = useState({
    totalDevedor: 0,
    inadimplentesCount: 0
  });

  useEffect(() => {
    // Stat calculation: Get all customers with debt
    const statsQuery = query(collection(db, 'clientes'), where('saldo_devedor', '>', 0));
    const unsubStats = onSnapshot(statsQuery, (snapshot) => {
      let total = 0;
      snapshot.docs.forEach(c => total += (c.data().saldo_devedor || 0));
      setStats({ totalDevedor: total, inadimplentesCount: snapshot.size });

      // Debtor alert
      if (snapshot.size > 0) {
        setNotification({ 
          message: `Atenção: Existem ${snapshot.size} clientes com débitos pendentes totalizando R$ ${total.toLocaleString('pt-BR')}`, 
          type: 'warning' 
        });
      }
    });

    // Display list: Top 5 debtors
    const q = query(
      collection(db, 'clientes'),
      where('saldo_devedor', '>', 0),
      limit(5)
    );

    const unsubList = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cliente));
      setDebtors(data);
      setLoading(false);
    });

    return () => {
      unsubStats();
      unsubList();
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F8F9FA]">Bem-vindo de volta!</h1>
          <p className="text-[#9BA1A6] text-sm">O que deseja fazer hoje?</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => navigate('/os')}
            className="btn-primary px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova OS
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link to="/os" className="card p-6 flex flex-col items-center justify-center gap-3 hover:border-[#FF6B00]/50 transition-all group">
          <div className="w-12 h-12 bg-[#FF6B00]/10 rounded-xl flex items-center justify-center group-hover:bg-[#FF6B00]/20 transition-colors">
            <Plus className="w-6 h-6 text-[#FF6B00]" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#9BA1A6]">Criar OS</span>
        </Link>
        <Link to="/clientes" className="card p-6 flex flex-col items-center justify-center gap-3 hover:border-[#0085FF]/50 transition-all group">
          <div className="w-12 h-12 bg-[#0085FF]/10 rounded-xl flex items-center justify-center group-hover:bg-[#0085FF]/20 transition-colors">
            <Users className="w-6 h-6 text-[#0085FF]" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#9BA1A6]">Gerir Clientes</span>
        </Link>
        <Link to="/estoque" className="card p-6 flex flex-col items-center justify-center gap-3 hover:border-[#27C485]/50 transition-all group">
          <div className="w-12 h-12 bg-[#27C485]/10 rounded-xl flex items-center justify-center group-hover:bg-[#27C485]/20 transition-colors">
            <TrendingUp className="w-6 h-6 text-[#27C485]" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#9BA1A6]">Ver Estoque</span>
        </Link>
        <Link to="/perfil" className="card p-6 flex flex-col items-center justify-center gap-3 hover:border-[#9BA1A6]/50 transition-all group">
          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-white/10 transition-colors">
            <AlertCircle className="w-6 h-6 text-[#9BA1A6]" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#9BA1A6]">Ver Relatórios</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Simple Summary */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[#9BA1A6] uppercase tracking-widest">Resumo Financeiro Rápido</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-6">
              <p className="text-[10px] font-bold text-[#9BA1A6] uppercase mb-1">Dívida Ativa</p>
              <h3 className="text-xl font-bold text-[#FF4D4D]">R$ {stats.totalDevedor.toLocaleString('pt-BR')}</h3>
            </div>
            <div className="card p-6">
              <p className="text-[10px] font-bold text-[#9BA1A6] uppercase mb-1">Inadimplentes</p>
              <h3 className="text-xl font-bold text-[#FF6B00]">{stats.inadimplentesCount}</h3>
            </div>
          </div>
        </div>

        {/* Recent Debtors list simplified */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[#9BA1A6] uppercase tracking-widest">Alertas de Pagamento</h2>
          <div className="card divide-y divide-[#2D333B]">
            {debtors.map(c => (
              <button 
                key={c.id} 
                onClick={() => navigate('/clientes', { state: { search: c.nome } })}
                className="p-4 flex items-center justify-between w-full hover:bg-white/5 transition-colors group text-left"
              >
                <div>
                  <p className="text-sm font-bold text-[#F8F9FA] group-hover:text-[#FF6B00] transition-colors">{c.nome}</p>
                  <p className="text-[10px] text-[#9BA1A6] font-mono">{c.cpf_cnpj}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#FF4D4D]">R$ {c.saldo_devedor.toLocaleString('pt-BR')}</p>
                  <ArrowUpRight className="w-4 h-4 text-[#9BA1A6] opacity-0 group-hover:opacity-100 transition-all" />
                </div>
              </button>
            ))}
            {loading && <div className="p-8 text-center text-[#9BA1A6] text-xs">Carregando...</div>}
            {debtors.length === 0 && !loading && <div className="p-8 text-center text-[#9BA1A6] text-xs">Sem alertas.</div>}
          </div>
        </div>
      </div>

      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 border bg-[#FF6B00] text-white border-orange-400/20">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bgColor, trend }: any) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-[#9BA1A6] uppercase tracking-wider mb-2">{title}</p>
          <h3 className={`text-2xl font-bold font-mono ${color}`}>{value}</h3>
          {trend && <p className="text-[10px] text-[#27C485] mt-2 font-medium">{trend}</p>}
        </div>
        <div className={`${bgColor} p-3 rounded-lg`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
      </div>
    </div>
  );
}
