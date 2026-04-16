import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { 
  Users, 
  AlertCircle, 
  TrendingUp, 
  DollarSign, 
  ArrowUpRight, 
  Plus, 
  Download,
  Settings,
  Building2,
  Lock,
  User as UserIcon,
  Save,
  Trash2,
  Bomb,
  X,
  Clock
} from 'lucide-react';
import { UserProfile } from '../App';

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  saldo_devedor: number;
}

export function Profile({ profile }: { profile: UserProfile | null }) {
  const [debtors, setDebtors] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalDevedor: 0,
    inadimplentesCount: 0,
    receitaMes: 0,
    totalMaoDeObra: 0,
    pendenteMes: 0
  });

  // Business Data State
  const [businessData, setBusinessData] = useState({
    nomeFantasia: 'Box Motors Peças e Serviços',
    cnpj: '12.345.678/0001-90',
    endereco: 'Rua das Oficinas, 123 - Centro',
    telefone: '(11) 98888-7777',
    email: 'contato@boxmotors.com.br'
  });

  useEffect(() => {
    // 1. Debtors Stats
    const debtorsQuery = query(
      collection(db, 'clientes'),
      where('saldo_devedor', '>', 0),
      orderBy('saldo_devedor', 'desc'),
      limit(10)
    );

    const unsubDebtors = onSnapshot(debtorsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cliente));
      setDebtors(data);
      
      let total = 0;
      data.forEach(c => total += c.saldo_devedor);
      setStats(prev => ({ ...prev, totalDevedor: total, inadimplentesCount: snapshot.size }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clientes');
    });

    // 2. Revenue calculation (simplified for this month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const financeQuery = query(
      collection(db, 'financeiro'),
      where('data', '>=', startOfMonth)
    );

    const unsubFinance = onSnapshot(financeQuery, (snapshot) => {
      let totalRevenue = 0;
      snapshot.docs.forEach(doc => {
        totalRevenue += doc.data().valor || 0;
      });
      setStats(prev => ({ ...prev, receitaMes: totalRevenue }));
    });

    // 3. Mão de Obra & Pending this month calculation
    const osQuery = query(
      collection(db, 'ordens_servico')
    );
    const unsubOS = onSnapshot(osQuery, (snapshot) => {
      let totalMaoDeObra = 0;
      let monthPending = 0;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        totalMaoDeObra += (data.mao_de_obra || 0);

        // Check if OS is from this month for monthPending
        const osDate = data.data_criacao?.toDate();
        if (osDate && osDate >= startOfMonth) {
          const totalGeral = data.total_geral || 0;
          const valorPago = data.valor_pago || 0;
          if (totalGeral > valorPago) {
            monthPending += (totalGeral - valorPago);
          }
        }
      });
      setStats(prev => ({ ...prev, totalMaoDeObra, pendenteMes: monthPending }));
    });

    return () => {
      unsubDebtors();
      unsubFinance();
      unsubOS();
    };
  }, []);

  const resetDatabase = async () => {
    if (resetConfirmationText !== 'LIMPAR TUDO') {
      setResetError('Por favor, digite "LIMPAR TUDO" exatamente para confirmar.');
      return;
    }

    setLoading(true);
    setResetError(null);
    try {
      const collections = ['clientes', 'estoque', 'ordens_servico', 'financeiro'];
      
      for (const colName of collections) {
        const snap = await getDocs(collection(db, colName));
        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }

      setIsResetModalOpen(false);
      window.location.reload();
    } catch (e) {
      console.error(e);
      setResetError('Erro ao resetar o banco de dados. Verifique suas permissões.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F8F9FA]">Perfil & Administração</h1>
          <p className="text-[#9BA1A6] text-sm">Configurações do sistema e visão consolidada</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Admin Section */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Dashboard Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Receita / Mês" 
              value={`R$ ${stats.receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              icon={TrendingUp}
              color="text-[#27C485]"
              bgColor="bg-[#27C485]/10"
            />
            <StatCard 
              title="A Receber (Mês)" 
              value={`R$ ${stats.pendenteMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              icon={Clock}
              color="text-[#FF6B00]"
              bgColor="bg-[#FF6B00]/10"
            />
            <StatCard 
              title="Total em Débito" 
              value={`R$ ${stats.totalDevedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              icon={DollarSign}
              color="text-[#FF4D4D]"
              bgColor="bg-[#FF4D4D]/10"
            />
            <StatCard 
              title="Mão de Obra" 
              value={`R$ ${stats.totalMaoDeObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              icon={Plus}
              color="text-[#0085FF]"
              bgColor="bg-[#0085FF]/10"
            />
          </div>

          {/* Business Data Form */}
          <div className="card">
            <div className="p-6 border-b border-[#2D333B] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#9BA1A6] uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#FF6B00]" />
                Dados da Empresa
              </h2>
              <button className="btn-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
                <Save className="w-3.5 h-3.5" />
                Salvar Alterações
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Nome Fantasia</label>
                <input 
                  type="text" 
                  value={businessData.nomeFantasia}
                  onChange={(e) => setBusinessData({ ...businessData, nomeFantasia: e.target.value })}
                  className="w-full bg-[#0A0B0E] border border-[#2D333B] rounded-lg px-4 py-2 text-[#F8F9FA] focus:ring-1 focus:ring-[#FF6B00] outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">CNPJ</label>
                <input 
                  type="text" 
                  value={businessData.cnpj}
                  onChange={(e) => setBusinessData({ ...businessData, cnpj: e.target.value })}
                  className="w-full bg-[#0A0B0E] border border-[#2D333B] rounded-lg px-4 py-2 text-[#F8F9FA] focus:ring-1 focus:ring-[#FF6B00] outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Endereço Completo</label>
                <input 
                  type="text" 
                  value={businessData.endereco}
                  onChange={(e) => setBusinessData({ ...businessData, endereco: e.target.value })}
                  className="w-full bg-[#0A0B0E] border border-[#2D333B] rounded-lg px-4 py-2 text-[#F8F9FA] focus:ring-1 focus:ring-[#FF6B00] outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Telefone de Contato</label>
                <input 
                  type="text" 
                  value={businessData.telefone}
                  onChange={(e) => setBusinessData({ ...businessData, telefone: e.target.value })}
                  className="w-full bg-[#0A0B0E] border border-[#2D333B] rounded-lg px-4 py-2 text-[#F8F9FA] focus:ring-1 focus:ring-[#FF6B00] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Maiores Devedores */}
          <div className="card overflow-hidden">
            <div className="p-6 border-b border-[#2D333B] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#9BA1A6] uppercase tracking-wider">
                Fluxo de Caixa Pendente (Top 10)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#121418] border-b border-[#2D333B]">
                  <tr>
                    <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-right">Dívida Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D333B]">
                  {loading ? (
                    <tr><td colSpan={2} className="px-6 py-12 text-center text-[#9BA1A6]">Carregando...</td></tr>
                  ) : (
                    debtors.map(cliente => (
                      <tr key={cliente.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-bold text-[#F8F9FA]">{cliente.nome}</td>
                        <td className="px-6 py-4 text-right text-[#FF4D4D] font-mono font-bold">
                          R$ {cliente.saldo_devedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Settings */}
        <div className="space-y-8">
          <div className="card p-6 border-l-4 border-[#FF6B00]">
            <h2 className="text-sm font-bold text-[#9BA1A6] uppercase mb-6 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-[#FF6B00]" />
              Minha Conta
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest mb-1">E-mail de Acesso</p>
                <p className="text-sm text-[#F8F9FA] font-medium">{profile?.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest mb-1">Nível de Acesso</p>
                <span className="bg-[#FF6B00]/10 text-[#FF6B00] text-[10px] font-extrabold px-2 py-0.5 rounded border border-[#FF6B00]/20 uppercase">
                  {profile?.role}
                </span>
              </div>
              <button className="w-full py-2 bg-[#2D333B] hover:bg-[#3D444D] text-[#F8F9FA] rounded-lg text-xs font-bold transition-colors mt-4">
                Redefinir Senha
              </button>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-bold text-[#9BA1A6] uppercase mb-6 flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#FF4D4D]" />
              Dados Sensíveis
            </h2>
            <p className="text-xs text-[#9BA1A6] mb-4">
              Informações restritas para auditores e administradores de sistema.
            </p>
            <div className="space-y-3">
              <div className="p-3 bg-[#0A0B0E] rounded-lg border border-[#2D333B] flex justify-between items-center">
                <span className="text-[10px] font-bold text-[#9BA1A6] uppercase">Backup Automático</span>
                <span className="text-[10px] font-bold text-[#27C485] uppercase">Ativo</span>
              </div>
              <div className="p-3 bg-[#0A0B0E] rounded-lg border border-[#2D333B] flex justify-between items-center">
                <span className="text-[10px] font-bold text-[#9BA1A6] uppercase">Última OS ID</span>
                <span className="text-[10px] font-mono text-[#F8F9FA]">#OS-{Math.floor(Math.random() * 9999)}</span>
              </div>
              <button className="w-full py-2 border border-[#FF4D4D]/30 text-[#FF4D4D] hover:bg-[#FF4D4D]/10 rounded-lg text-xs font-bold transition-colors">
                Exportar Banco de Dados (JSON)
              </button>
              
              <div className="pt-4 border-t border-[#2D333B] mt-4">
                <button 
                  onClick={() => setIsResetModalOpen(true)}
                  disabled={loading}
                  className="w-full py-3 bg-[#FF4D4D]/10 border border-[#FF4D4D]/50 text-[#FF4D4D] hover:bg-[#FF4D4D] hover:text-white rounded-lg text-xs font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-2 group"
                >
                  <Bomb className="w-4 h-4 group-hover:animate-bounce" />
                  Botão de Pânico: Reset Total
                </button>
                <p className="text-[9px] text-[#9BA1A6] mt-2 text-center uppercase font-bold tracking-tighter">
                  Cuidado: Apaga clientes, estoque e histórico irremediavelmente.
                </p>
              </div>

              {/* Reset Confirmation Modal */}
              {isResetModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                  <div className="card w-full max-w-md p-8 border-[#FF4D4D]/30 relative">
                    <button onClick={() => setIsResetModalOpen(false)} className="absolute top-4 right-4 text-[#9BA1A6] hover:text-[#F8F9FA]"><X className="w-6 h-6" /></button>
                    <div className="w-20 h-20 bg-[#FF4D4D]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Bomb className="w-10 h-10 text-[#FF4D4D] animate-pulse" />
                    </div>
                    <h2 className="text-2xl font-black text-[#F8F9FA] text-center mb-2 uppercase tracking-tighter">Zona de Perigo Extremo</h2>
                    <p className="text-[#9BA1A6] text-center text-sm mb-6">
                      Esta ação é irreversível. Todos os dados de clientes, estoque e histórico serão apagados permanentemente.
                    </p>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest block text-center">
                          Digite <span className="text-white">LIMPAR TUDO</span> para confirmar:
                        </label>
                        <input 
                          type="text"
                          className="w-full px-4 py-3 bg-[#0A0B0E] border border-dashed border-[#FF4D4D]/40 rounded-lg text-[#F8F9FA] text-center font-black focus:border-[#FF4D4D] outline-none"
                          placeholder="..."
                          value={resetConfirmationText}
                          onChange={(e) => setResetConfirmationText(e.target.value)}
                        />
                      </div>

                      {resetError && (
                        <div className="p-3 bg-[#FF4D4D]/10 border border-[#FF4D4D]/20 rounded-lg text-[#FF4D4D] text-[10px] font-bold text-center">
                          {resetError}
                        </div>
                      )}

                      <div className="flex gap-4">
                        <button 
                          onClick={() => setIsResetModalOpen(false)}
                          className="flex-1 px-4 py-3 border border-[#2D333B] rounded-lg text-[#9BA1A6] font-bold text-xs uppercase hover:bg-white/5"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={resetDatabase}
                          disabled={loading || resetConfirmationText !== 'LIMPAR TUDO'}
                          className="flex-1 px-4 py-3 bg-[#FF4D4D] text-white rounded-lg font-black text-xs uppercase hover:bg-[#D43D3D] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? 'Limpando...' : 'Confirmar Reset'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bgColor }: any) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <div className={`${bgColor} p-3 rounded-xl`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">{title}</p>
          <h3 className={`text-lg font-bold font-mono ${color}`}>{value}</h3>
        </div>
      </div>
    </div>
  );
}
