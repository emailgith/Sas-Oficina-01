import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  deleteDoc, 
  getDoc,
  updateDoc,
  Timestamp,
  runTransaction,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  FileText, 
  Search, 
  Calendar, 
  User, 
  Car, 
  DollarSign, 
  Trash2, 
  Edit2, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  X,
  Filter,
  Plus,
  ShoppingCart,
  Package
} from 'lucide-react';

interface OS {
  id: string;
  cliente_id: string;
  veiculo: string;
  total_geral: number;
  valor_pago: number;
  status_financeiro: 'pago' | 'pendente' | 'parcial';
  status_os: 'aberta' | 'finalizada';
  data_criacao: any;
  itens: any[];
  mao_de_obra: number;
}

interface Cliente {
  id: string;
  nome: string;
}

export function History() {
  const [osList, setOsList] = useState<OS[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [inventory, setInventory] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    // Fetch clients for name lookup
    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snap) => {
      const clientMap: Record<string, string> = {};
      snap.docs.forEach(d => {
        clientMap[d.id] = d.data().nome;
      });
      setClientes(clientMap);
    });

    const unsubInv = onSnapshot(collection(db, 'estoque'), (snap) => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const q = query(collection(db, 'ordens_servico'), orderBy('data_criacao', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OS));
      setOsList(data);
      setLoading(false);
    });

    return () => {
      unsubClientes();
      unsubInv();
      unsubscribe();
    };
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [editingOS, setEditingOS] = useState<OS | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    cliente_id: '',
    veiculo: '',
    valor_pago: 0,
    mao_de_obra: 0,
    itens: [] as any[]
  });

  const openEditModal = (os: OS) => {
    setEditingOS(os);
    setFormData({
      cliente_id: os.cliente_id,
      veiculo: os.veiculo,
      valor_pago: os.valor_pago,
      mao_de_obra: os.mao_de_obra,
      itens: [...os.itens]
    });
    setIsModalOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOS) return;
    try {
      const osRef = doc(db, 'ordens_servico', editingOS.id);
      
      const totalItens = formData.itens.reduce((acc, item) => acc + (item.qtd * item.preco_unit), 0);
      const totalGeral = totalItens + Number(formData.mao_de_obra);
      
      await updateDoc(osRef, {
        cliente_id: formData.cliente_id,
        veiculo: formData.veiculo,
        mao_de_obra: Number(formData.mao_de_obra),
        valor_pago: Number(formData.valor_pago),
        itens: formData.itens,
        total_geral: totalGeral,
        status_financeiro: Number(formData.valor_pago) >= totalGeral ? 'pago' : Number(formData.valor_pago) > 0 ? 'parcial' : 'pendente'
      });
      setIsModalOpen(false);
      setNotification({ message: 'OS atualizada com sucesso!', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ordens_servico/${editingOS.id}`);
      setNotification({ message: 'Erro ao atualizar OS.', type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'ordens_servico', itemToDelete));
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      setNotification({ message: 'OS excluída com sucesso!', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ordens_servico/${itemToDelete}`);
      setNotification({ message: 'Erro ao excluir OS. Verifique suas permissões.', type: 'error' });
    }
  };

  const confirmDelete = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleQuitar = async (os: OS) => {
    const restante = os.total_geral - os.valor_pago;
    if (restante <= 0) return;

    try {
      if (!os.cliente_id) {
        setNotification({ message: 'Erro: ID do cliente ausente nesta OS.', type: 'error' });
        return;
      }

      await runTransaction(db, async (transaction) => {
        const clientRef = doc(db, 'clientes', os.cliente_id);
        const osRef = doc(db, 'ordens_servico', os.id);
        
        const clientSnap = await transaction.get(clientRef);
        if (!clientSnap.exists()) throw new Error("Cliente não encontrado");
        
        const currentSaldo = clientSnap.data().saldo_devedor || 0;
        
        // Update OS
        transaction.update(osRef, {
          valor_pago: os.total_geral,
          status_financeiro: 'pago'
        });

        // Update Client Debt
        transaction.update(clientRef, {
          saldo_devedor: Math.max(0, currentSaldo - restante)
        });

        // Add to Financeiro
        const financeRef = doc(collection(db, 'financeiro'));
        transaction.set(financeRef, {
          os_id: os.id,
          cliente_id: os.cliente_id,
          valor: restante,
          tipo: 'receita',
          descricao: `Quitação OS #${os.id.substring(0, 5)} - ${os.veiculo}`,
          data: serverTimestamp()
        });
      });

      setNotification({ message: 'OS quitada com sucesso!', type: 'success' });
    } catch (error) {
      console.error(error);
      setNotification({ message: 'Erro ao quitar OS.', type: 'error' });
    }
  };

  const filteredOS = osList.filter(os => {
    const clientName = clientes[os.cliente_id]?.toLowerCase() || '';
    const vehicle = os.veiculo.toLowerCase();
    const matchesSearch = clientName.includes(searchTerm.toLowerCase()) || vehicle.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || os.status_financeiro === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: OS['status_financeiro']) => {
    switch (status) {
      case 'pago':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#27C485]/10 text-[#27C485] border border-[#27C485]/20">Pago</span>;
      case 'parcial':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20">Parcial</span>;
      case 'pendente':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#FF4D4D]/10 text-[#FF4D4D] border border-[#FF4D4D]/20">Pendente</span>;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#F8F9FA]">Histórico de OS</h1>
          <p className="text-[#9BA1A6] text-sm">Registro completo de atendimentos e pagamentos</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="bg-[#1C1F26] border border-[#2D333B] text-[#F8F9FA] px-4 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-[#FF6B00]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos Status</option>
            <option value="pago">Pagos</option>
            <option value="parcial">Parciais</option>
            <option value="pendente">Pendentes</option>
          </select>
        </div>
      </div>

      <div className="card p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-[#9BA1A6] absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Buscar por cliente ou veículo..."
            className="w-full pl-10 pr-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#121418] border-b border-[#2D333B]">
              <tr>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider">Data / Cliente</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider">Veículo</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-right">Valor Total</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-right">Pago</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-right">Pendente</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-center">Status</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2D333B]">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#9BA1A6]">Carregando...</td></tr>
              ) : filteredOS.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#9BA1A6]">Nenhuma Ordem de Serviço encontrada.</td></tr>
              ) : (
                filteredOS.map((os) => (
                  <tr key={os.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-[10px] text-[#FF6B00] font-bold uppercase mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(os.data_criacao)}
                      </div>
                      <div className="font-bold text-[#F8F9FA]">{clientes[os.cliente_id] || 'Cliente Excluído'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-[#F8F9FA]">
                        <Car className="w-4 h-4 text-[#9BA1A6]" />
                        {os.veiculo}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-[#F8F9FA] font-mono">
                      R$ {os.total_geral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-[#27C485] font-mono whitespace-nowrap">
                      R$ {os.valor_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-[#FF4D4D] font-mono whitespace-nowrap">
                      R$ {(os.total_geral - os.valor_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(os.status_financeiro)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {os.status_financeiro !== 'pago' && (
                          <button 
                            onClick={() => handleQuitar(os)}
                            className="p-1.5 hover:bg-[#27C485]/10 rounded text-[#27C485]"
                            title="Quitar OS"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => openEditModal(os)}
                          className="p-1.5 hover:bg-white/5 rounded text-[#9BA1A6] hover:text-[#F8F9FA]"
                          title="Editar OS"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => confirmDelete(os.id)}
                          className="p-1.5 hover:bg-[#FF4D4D]/10 rounded text-[#FF4D4D]"
                          title="Excluir OS"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="card w-full max-w-2xl p-8 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-[#9BA1A6] hover:text-[#F8F9FA]"><X className="w-6 h-6" /></button>
            <h2 className="text-2xl font-bold text-[#F8F9FA] mb-6">Editar Ordem de Serviço</h2>
            
            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Cliente</label>
                  <select 
                    required
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] outline-none focus:ring-1 focus:ring-[#FF6B00]"
                    value={formData.cliente_id}
                    onChange={e => setFormData({...formData, cliente_id: e.target.value})}
                  >
                    <option value="">Selecione um cliente</option>
                    {Object.entries(clientes).map(([id, nome]) => (
                      <option key={id} value={id}>{nome}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Veículo</label>
                  <input 
                    required
                    type="text"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-1 focus:ring-[#FF6B00] outline-none"
                    value={formData.veiculo}
                    onChange={e => setFormData({...formData, veiculo: e.target.value})}
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#9BA1A6] uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Peças e Itens
                  </h3>
                  <div className="relative">
                    <select 
                      className="bg-[#1C1F26] border border-[#2D333B] text-[#9BA1A6] text-[10px] p-1 rounded outline-none focus:ring-1 focus:ring-[#FF6B00]"
                      onChange={(e) => {
                        const prod = inventory.find(p => p.id === e.target.value);
                        if (prod) {
                          setFormData({
                            ...formData,
                            itens: [...formData.itens, { prod_id: prod.id, desc: prod.descricao, qtd: 1, preco_unit: prod.preco_venda }]
                          });
                        }
                        e.target.value = '';
                      }}
                    >
                      <option value="">+ Adicionar Item</option>
                      {inventory.map(p => (
                        <option key={p.id} value={p.id}>{p.descricao} (R$ {p.preco_venda})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-[#0A0B0E] rounded-lg border border-[#2D333B] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#121418] border-b border-[#2D333B]">
                      <tr>
                        <th className="px-4 py-2 text-[#9BA1A6] font-bold uppercase">Item</th>
                        <th className="px-4 py-2 text-[#9BA1A6] font-bold uppercase text-center w-16">Qtd</th>
                        <th className="px-4 py-2 text-[#9BA1A6] font-bold uppercase text-right w-24">Preço</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2D333B]">
                      {formData.itens.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-[#F8F9FA] font-medium">{item.desc}</td>
                          <td className="px-4 py-2">
                            <input 
                              type="number"
                              className="w-full bg-[#121418] border border-[#2D333B] rounded text-center text-[#F8F9FA] outline-none"
                              value={item.qtd}
                              onChange={e => {
                                const newItens = [...formData.itens];
                                newItens[idx].qtd = Math.max(1, Number(e.target.value));
                                setFormData({...formData, itens: newItens});
                              }}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="number"
                              step="0.01"
                              className="w-full bg-[#121418] border border-[#2D333B] rounded text-right text-[#F8F9FA] outline-none px-1 font-mono"
                              value={item.preco_unit}
                              onChange={e => {
                                const newItens = [...formData.itens];
                                newItens[idx].preco_unit = Math.max(0, Number(e.target.value));
                                setFormData({...formData, itens: newItens});
                              }}
                            />
                          </td>
                          <td className="px-4 py-2 text-center text-[#FF4D4D]">
                            <button 
                              type="button"
                              onClick={() => {
                                setFormData({...formData, itens: formData.itens.filter((_, i) => i !== idx)});
                              }}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {formData.itens.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-4 text-center text-[#9BA1A6] italic">Nenhum item adicionado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#2D333B]">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Mão de Obra (R$)</label>
                  <input 
                    required
                    type="number"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-1 focus:ring-[#FF6B00] outline-none"
                    value={formData.mao_de_obra}
                    onChange={e => setFormData({...formData, mao_de_obra: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Valor Pago (R$)</label>
                  <input 
                    required
                    type="number"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-1 focus:ring-[#FF6B00] outline-none"
                    value={formData.valor_pago}
                    onChange={e => setFormData({...formData, valor_pago: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="p-4 bg-[#121418] rounded-xl flex items-center justify-between border border-[#2D333B]">
                <span className="text-xs font-bold text-[#9BA1A6] uppercase">Novo Total Estimado</span>
                <span className="font-mono font-bold text-[#27C485]">
                  R$ {(formData.itens.reduce((acc, item) => acc + (item.qtd * item.preco_unit), 0) + Number(formData.mao_de_obra)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-[#2D333B] rounded-lg text-[#9BA1A6] font-bold text-xs uppercase hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="btn-primary flex-1 px-4 py-3 rounded-lg font-bold text-xs uppercase"
                >
                  Confirmar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="card w-full max-w-sm p-8 relative border-[#FF4D4D]/20">
            <div className="w-16 h-16 bg-[#FF4D4D]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-[#FF4D4D]" />
            </div>
            <h2 className="text-xl font-bold text-[#F8F9FA] text-center mb-2">Excluir Ordem de Serviço</h2>
            <p className="text-[#9BA1A6] text-center text-sm mb-8">
              Tem certeza que deseja excluir permanentemente esta OS? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 border border-[#2D333B] rounded-lg text-[#9BA1A6] font-medium hover:bg-white/5 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-[#FF4D4D] text-white rounded-lg font-bold text-sm hover:bg-[#D43D3D] transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${
            notification.type === 'success' ? 'bg-[#27C485] text-white border-[#27C485]/20' : 'bg-[#FF4D4D] text-white border-[#FF4D4D]/20'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-bold uppercase tracking-wider">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
