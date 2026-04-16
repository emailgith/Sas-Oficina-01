import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  runTransaction, 
  serverTimestamp,
  getDoc,
  where,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  FileText, 
  Search, 
  Plus, 
  Trash2, 
  User, 
  Wrench, 
  ShoppingCart, 
  CheckCircle2, 
  Clock,
  AlertCircle,
  X,
  Package
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UserProfile } from '../App';

interface Cliente {
  id: string;
  nome: string;
  moto_ano?: string;
  saldo_devedor: number;
}

interface Produto {
  id: string;
  descricao: string;
  codigo_barras: string;
  preco_venda: number;
  qtd_atual: number;
}

interface OSItem {
  prod_id: string;
  desc: string;
  qtd: number;
  preco_unit: number;
}

export function OSFlow({ profile }: { profile: UserProfile | null }) {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [inventory, setInventory] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New OS State
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [veiculo, setVeiculo] = useState('');
  const [cart, setCart] = useState<OSItem[]>([]);
  const [maoDeObra, setMaoDeObra] = useState(0);
  const [valorPago, setValorPago] = useState(0);
  const [tipoPagamento, setTipoPagamento] = useState<'pix' | 'cartao' | 'dinheiro'>('pix');
  
  // Search states
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [prodSearch, setProdSearch] = useState('');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)));
    });
    const unsubInv = onSnapshot(collection(db, 'estoque'), (snap) => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() } as Produto)));
      setLoading(false);
    });
    return () => { unsubClientes(); unsubInv(); };
  }, []);

  const addToCart = (p: Produto) => {
    const existing = cart.find(item => item.prod_id === p.id);
    if (existing) {
      setCart(cart.map(item => item.prod_id === p.id ? { ...item, qtd: item.qtd + 1 } : item));
    } else {
      setCart([...cart, { prod_id: p.id, desc: p.descricao, qtd: 1, preco_unit: p.preco_venda }]);
    }
    setIsProductModalOpen(false);
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.prod_id !== id));
  };

  const totalItens = cart.reduce((acc, item) => acc + (item.qtd * item.preco_unit), 0);
  const totalGeral = totalItens + Number(maoDeObra);

  const addManualItem = () => {
    const newItem = {
      prod_id: `manual_${Date.now()}`,
      desc: 'NOVO ITEM',
      qtd: 1,
      preco_unit: 0
    };
    setCart([...cart, newItem]);
  };

  const finalizeOS = async (forcedValorPago?: number) => {
    const finalValorPago = forcedValorPago !== undefined ? forcedValorPago : valorPago;

    if (!selectedCliente || !veiculo || cart.length === 0) {
      setNotification({ message: 'Preencha todos os campos obrigatórios.', type: 'error' });
      return;
    }

    try {
      if (!selectedCliente) {
        setNotification({ message: 'Erro: Cliente não selecionado adequadamente.', type: 'error' });
        return;
      }

      await runTransaction(db, async (transaction) => {
        const osRef = doc(collection(db, 'ordens_servico'));
        const clienteRef = doc(db, 'clientes', selectedCliente);
        
        // 1. ALL READS FIRST
        const clienteSnap = await transaction.get(clienteRef);
        if (!clienteSnap.exists()) throw "Cliente não encontrado";

        const productSnaps = [];
        for (const item of cart) {
          if (item.prod_id.startsWith('manual_')) continue; // Skip reads for manual items
          const prodRef = doc(db, 'estoque', item.prod_id);
          const snap = await transaction.get(prodRef);
          productSnaps.push({ ref: prodRef, snap, item });
        }
        
        const currentSaldo = clienteSnap.data().saldo_devedor || 0;
        const debito = totalGeral - finalValorPago;
        
        // 2. ALL WRITES AFTER READS
        // Create OS
        transaction.set(osRef, {
          cliente_id: selectedCliente,
          veiculo,
          itens: cart,
          mao_de_obra: Number(maoDeObra),
          total_geral: totalGeral,
          valor_pago: Number(finalValorPago),
          status_financeiro: finalValorPago >= totalGeral ? 'pago' : finalValorPago > 0 ? 'parcial' : 'pendente',
          status_os: 'finalizada',
          data_criacao: serverTimestamp()
        });

        // Update Inventory
        for (const p of productSnaps) {
          if (p.snap.exists()) {
            const newQtd = (p.snap.data().qtd_atual || 0) - p.item.qtd;
            transaction.update(p.ref, { qtd_atual: newQtd });
          }
        }

        // Update Client Debt
        if (debito > 0) {
          transaction.update(clienteRef, { 
            saldo_devedor: currentSaldo + debito,
            ultima_os: serverTimestamp()
          });
        }

        // Create Finance Record
        if (finalValorPago > 0) {
          const finRef = doc(collection(db, 'financeiro'));
          transaction.set(finRef, {
            cliente_id: selectedCliente,
            os_id: osRef.id,
            valor: Number(finalValorPago),
            data: serverTimestamp(),
            tipo_pagamento: tipoPagamento,
            tipo: 'receita',
            descricao: `Serviço OS #${osRef.id.substring(0, 5)} - ${veiculo}`
          });
        }
      });

      setNotification({ message: 'OS Finalizada com sucesso!', type: 'success' });
      // Reset form
      setCart([]);
      setVeiculo('');
      setSelectedCliente('');
      setMaoDeObra(0);
      setValorPago(0);

      // Navigate to history to show it worked
      setTimeout(() => {
        navigate('/historico');
      }, 1500);
    } catch (e) {
      console.error(e);
      setNotification({ message: 'Erro ao finalizar OS.', type: 'error' });
    }
  };

  const filteredClientes = clientes.filter(c => c.nome.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredInventory = inventory.filter(p => 
    p.descricao.toLowerCase().includes(prodSearch.toLowerCase()) || 
    p.codigo_barras.includes(prodSearch)
  );  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: OS Creation */}
      <div className="lg:col-span-2 space-y-6">
        <div className="card p-6">
          <h2 className="text-sm font-bold text-[#9BA1A6] uppercase tracking-wider mb-6 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-[#FF6B00]" />
            Nova Ordem de Serviço
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#9BA1A6] uppercase tracking-wider">Cliente</label>
              <div className="relative">
                <Search className="w-4 h-4 text-[#9BA1A6] absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Buscar cliente..."
                  className="w-full pl-9 pr-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                  value={clientSearch}
                  onFocus={() => setShowClientList(true)}
                  onChange={(e) => { setClientSearch(e.target.value); setShowClientList(true); }}
                />
                {(clientSearch && showClientList) && (
                  <div className="absolute z-10 w-full mt-1 bg-[#1C1F26] border border-[#2D333B] rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                    {filteredClientes.map(c => (
                      <button 
                        key={c.id}
                        onClick={() => { 
                          setSelectedCliente(c.id); 
                          setClientSearch(c.nome); 
                          if (c.moto_ano) setVeiculo(c.moto_ano);
                          setShowClientList(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-white/5 text-sm text-[#F8F9FA]"
                      >
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#9BA1A6] uppercase tracking-wider">Veículo (Placa/Modelo)</label>
              <input 
                type="text"
                placeholder="Ex: ABC-1234 / Corolla"
                className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                value={veiculo}
                onChange={(e) => setVeiculo(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Product Selection Button */}
        <div className="card p-6 flex items-center justify-between bg-[#1C1F26]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#FF6B00]/10 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-[#FF6B00]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F8F9FA] uppercase tracking-wider">Adicionar Peças</h3>
              <p className="text-[10px] text-[#9BA1A6]">Pesquise e selecione itens do seu estoque</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsProductModalOpen(true)}
              className="px-4 py-2.5 bg-[#2D333B] hover:bg-[#3D444D] text-[#F8F9FA] rounded-lg text-xs font-bold flex items-center gap-2 transition-all"
            >
              <Search className="w-4 h-4" />
              ABRIR CATALOGO
            </button>
            <button 
              onClick={addManualItem}
              className="btn-primary px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-orange-900/20"
            >
              <Plus className="w-4 h-4" />
              ITEM MANUAL
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#121418] border-b border-[#2D333B]">
              <tr>
                <th className="px-4 py-3 text-[10px] font-black text-[#9BA1A6] uppercase tracking-widest">Item</th>
                <th className="px-4 py-3 text-[10px] font-black text-[#9BA1A6] uppercase tracking-widest text-center">Qtd</th>
                <th className="px-4 py-3 text-[10px] font-black text-[#9BA1A6] uppercase tracking-widest text-right">Unit.</th>
                <th className="px-4 py-3 text-[10px] font-black text-[#9BA1A6] uppercase tracking-widest text-right">Subtotal</th>
                <th className="px-4 py-3 text-[10px] font-black text-[#9BA1A6] uppercase tracking-widest text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2D333B]">
              {cart.map(item => (
                <tr key={item.prod_id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-4 py-1.5">
                    <input 
                      type="text"
                      className="w-full bg-transparent border-b border-transparent hover:border-[#2D333B] focus:border-[#FF6B00] py-0.5 text-sm font-bold text-[#F8F9FA] tracking-tight outline-none transition-all"
                      value={item.desc}
                      onChange={(e) => {
                        setCart(cart.map(i => i.prod_id === item.prod_id ? { ...i, desc: e.target.value } : i));
                      }}
                    />
                  </td>
                  <td className="px-4 py-1.5 text-center">
                    <input 
                      type="number" 
                      className="w-14 text-center bg-[#1C1F26] border border-[#2D333B] rounded-lg py-1 text-sm font-bold text-[#F8F9FA] focus:border-[#FF6B00] outline-none transition-all"
                      value={item.qtd}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value));
                        setCart(cart.map(i => i.prod_id === item.prod_id ? { ...i, qtd: val } : i));
                      }}
                    />
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end group/price">
                      <span className="text-xs font-bold text-[#FF6B00] mr-1 opacity-0 group-hover/price:opacity-100 transition-opacity">R$</span>
                      <input 
                        type="number" 
                        step="0.01"
                        className="w-24 text-right bg-[#0A0B0E]/50 border border-transparent hover:border-[#2D333B] focus:border-[#FF6B00] focus:bg-[#0A0B0E] py-1 rounded text-base font-bold text-[#F8F9FA] font-mono outline-none transition-all px-2"
                        value={item.preco_unit}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          setCart(cart.map(i => i.prod_id === item.prod_id ? { ...i, preco_unit: val } : i));
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-1.5 text-right">
                    <span className="text-base font-bold text-[#27C485] font-mono whitespace-nowrap">
                      R$ {(item.qtd * item.preco_unit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-center">
                    <button 
                      onClick={() => removeFromCart(item.prod_id)} 
                      className="text-[#FF4D4D] opacity-40 hover:opacity-100 p-2 hover:bg-[#FF4D4D]/10 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#9BA1A6] italic text-sm">Nenhum item adicionado ao carrinho</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Summary & Payment */}
      <div className="space-y-6">
        {/* Product Selection Modal */}
        {isProductModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[99] flex items-center justify-center p-4">
            <div className="card w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
              <div className="p-6 border-b border-[#2D333B] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#F8F9FA]">Lista de Produtos</h2>
                <button onClick={() => setIsProductModalOpen(false)} className="text-[#9BA1A6] hover:text-[#F8F9FA]"><X className="w-6 h-6" /></button>
              </div>
              <div className="p-6 border-b border-[#2D333B]">
                <div className="relative">
                  <Search className="w-5 h-5 text-[#9BA1A6] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text"
                    placeholder="Filtrar por nome..."
                    className="w-full pl-10 pr-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] outline-none"
                    value={prodSearch}
                    onChange={(e) => setProdSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="flex flex-col gap-2">
                  {filteredInventory.map(p => (
                    <button 
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="flex items-center justify-between p-3 bg-[#0A0B0E] border border-[#2D333B] rounded-lg hover:border-[#FF6B00] hover:bg-[#FF6B00]/5 transition-all text-left group"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="font-bold text-[#F8F9FA] group-hover:text-[#FF6B00] transition-colors truncate">{p.descricao}</p>
                        <p className="text-[10px] text-[#9BA1A6] font-mono uppercase">{p.codigo_barras || 'S/ REF'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[#27C485] font-mono">R$ {p.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <div className="flex items-center justify-end gap-2 mt-0.5">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${p.qtd_atual > 0 ? 'bg-white/5 text-[#9BA1A6]' : 'bg-[#FF4D4D]/10 text-[#FF4D4D]'}`}>
                            Estoque: {p.qtd_atual}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredInventory.length === 0 && (
                    <div className="col-span-full py-12 text-center text-[#9BA1A6]">
                      Nenhum item encontrado com "{prodSearch}"
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card p-6 sticky top-28">
          <h3 className="text-sm font-bold text-[#9BA1A6] uppercase tracking-wider mb-6 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#9BA1A6]" />
            Resumo da OS
          </h3>
          
          <div className="space-y-4 mb-8">
            <div className="flex justify-between text-sm text-[#9BA1A6]">
              <span>Total Peças:</span>
              <span className="font-mono">R$ {totalItens.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#9BA1A6] uppercase tracking-wider">Mão de Obra (R$)</label>
              <input 
                type="number"
                className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                value={maoDeObra}
                onChange={(e) => setMaoDeObra(Number(e.target.value))}
              />
            </div>
            <div className="pt-4 border-t border-[#2D333B] flex justify-between items-center">
              <span className="text-sm font-bold text-[#F8F9FA] uppercase tracking-wider">Total Geral</span>
              <span className="text-2xl font-black text-[#27C485] font-mono">R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Opções de Finalização</h4>
      </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#9BA1A6] uppercase tracking-wider">Valor Pago Agora (R$)</label>
              <input 
                type="number"
                className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                value={valorPago}
                onChange={(e) => setValorPago(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#9BA1A6] uppercase tracking-wider">Forma de Pagamento</label>
              <select 
                className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                value={tipoPagamento}
                onChange={(e) => setTipoPagamento(e.target.value as any)}
              >
                <option value="pix">PIX</option>
                <option value="cartao">Cartão</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
            
            <div className="p-4 rounded-lg flex items-start gap-3 border bg-[#0A0B0E] border-[#2D333B]">
              <div className="flex-1 space-y-4">
                <button 
                  type="button"
                  onClick={() => {
                    setValorPago(0);
                    setNotification({ message: 'Registrando OS como Pendente...', type: 'warning' });
                    finalizeOS(0);
                  }}
                  className="w-full py-2 bg-[#FF4D4D] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#D43D3D] transition-all"
                >
                  Lançar como Pendente
                </button>
                <button 
                  onClick={finalizeOS}
                  className="btn-primary w-full py-4 rounded-xl font-bold text-lg shadow-xl shadow-orange-900/20 active:scale-95"
                >
                  Finalizar OS
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${
            notification.type === 'success' ? 'bg-[#27C485] text-white border-[#27C485]/20' : 
            notification.type === 'warning' ? 'bg-[#FF6B00] text-white border-orange-400/20' :
            'bg-[#FF4D4D] text-white border-[#FF4D4D]/20'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
             notification.type === 'warning' ? <AlertCircle className="w-5 h-5" /> :
             <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-bold uppercase tracking-wider">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
