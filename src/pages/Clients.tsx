import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Users, Plus, Search, Phone, MapPin, CreditCard, UserPlus, Edit2, FileText, X, Trash2, CheckCircle2, AlertCircle, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { writeBatch } from 'firebase/firestore';
import { useLocation } from 'react-router-dom';
import { UserProfile } from '../App';

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string;
  telefone: string;
  endereco: string;
  moto_ano?: string;
  saldo_devedor: number;
}

export function Clients({ profile }: { profile: UserProfile | null }) {
  const location = useLocation();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchTerm, setSearchTerm] = useState((location.state as any)?.search || '');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPanicModalOpen, setIsPanicModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'warning' } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  
  // Client State
  const [formData, setFormData] = useState({
    nome: '',
    cpf_cnpj: '',
    telefone: '',
    endereco: '',
    moto_ano: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'clientes'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setClientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cliente)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openModal = (client?: Cliente) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        nome: client.nome,
        cpf_cnpj: client.cpf_cnpj,
        telefone: client.telefone,
        endereco: client.endereco,
        moto_ano: client.moto_ano || ''
      });
    } else {
      setEditingClient(null);
      setFormData({ nome: '', cpf_cnpj: '', telefone: '', endereco: '', moto_ano: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingClient) {
        const clientRef = doc(db, 'clientes', editingClient.id);
        await setDoc(clientRef, { ...formData }, { merge: true });
      } else {
        await addDoc(collection(db, 'clientes'), {
          ...formData,
          saldo_devedor: 0,
          ultima_os: null,
          created_at: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setNotification({ message: editingClient ? 'Cliente atualizado!' : 'Cliente cadastrado!', type: 'success' });
    } catch (e) {
      console.error(e);
      setNotification({ message: 'Erro ao salvar cliente.', type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'clientes', itemToDelete));
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      setNotification({ message: 'Cliente excluído com sucesso!', type: 'success' });
    } catch (e) {
      console.error(e);
      setNotification({ message: 'Erro ao excluir cliente.', type: 'error' });
    }
  };

  const confirmDelete = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handlePanicReset = async () => {
    if (profile?.role !== 'admin') {
      setNotification({ message: 'Apenas administradores podem fazer isso.', type: 'error' });
      return;
    }
    
    setIsImporting(true);
    try {
      const snap = await getDocs(collection(db, 'clientes'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setIsPanicModalOpen(false);
      setNotification({ message: 'Base de clientes totalmente zerada!', type: 'success' });
    } catch (e) {
      console.error(e);
      setNotification({ message: 'Erro ao zerar base de clientes.', type: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];

        const batch = writeBatch(db);
        let importedCount = 0;

        // Skip headers and process rows
        // Format based on image: 
        // [0] Razão Social / Nome Fantasia 
        // [1] CNPJ/CPF
        // [2] IE/RG
        // [3] Endereço
        // [4] Fone
        // [6] Celular
        
        for (const row of data) {
          const rawNome = row[0] ? String(row[0]) : '';
          
          // Skip headers and irrelevant lines (Page count, reports title etc)
          if (!rawNome || 
              rawNome.toLowerCase().includes('relação de clientes') || 
              rawNome.toLowerCase().includes('razão social') ||
              rawNome.toLowerCase().includes('inativo') ||
              rawNome.trim().startsWith('Origem:')
          ) continue;

          // Cleaning ID/Name (Removing leading numbers if present like "19 - THALISSON")
          const nome = rawNome.replace(/^\d+\s*-\s*/, '').trim();
          const cpf_cnpj = row[1] ? String(row[1]).trim() : '';
          const endereco = row[3] ? String(row[3]).trim() : '';
          
          // Phone handling (Fone or Celular)
          let telefone = '';
          if (row[6]) telefone = String(row[6]).trim();
          else if (row[4]) telefone = String(row[4]).trim();
          
          if (nome) {
            const clientData = {
              nome,
              cpf_cnpj,
              telefone,
              endereco,
              saldo_devedor: 0,
              ultima_os: null,
              created_at: serverTimestamp()
            };

            // Unique ID based on name/doc
            const docId = cpf_cnpj ? 
              cpf_cnpj.replace(/[^0-9]/g, '') : 
              nome.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

            batch.set(doc(db, 'clientes', docId), clientData, { merge: true });
            importedCount++;
          }
        }

        await batch.commit();
        setNotification({ message: `${importedCount} clientes importados com sucesso!`, type: 'success' });
      } catch (err) {
        console.error(err);
        setNotification({ message: 'Erro ao processar arquivo.', type: 'error' });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  const filtered = clientes.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.cpf_cnpj.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#F8F9FA]">Gestão de Clientes</h1>
          <p className="text-[#9BA1A6] text-sm">Base de dados e histórico financeiro</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".csv,.xlsx,.xls"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="btn-outline px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importando...' : 'Importar'}
          </button>
          {profile?.role === 'admin' && (
            <button 
              onClick={() => setIsPanicModalOpen(true)}
              className="px-4 py-2 rounded-lg text-xs font-black bg-red-950/30 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
              title="Zerar todos os clientes"
            >
              <AlertCircle className="w-4 h-4" />
              PANICO
            </button>
          )}
          <button 
            onClick={() => openModal()}
            className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Novo Cliente
          </button>
        </div>
      </div>

      <div className="card p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-[#9BA1A6] absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Buscar por nome ou CPF/CNPJ..."
            className="w-full pl-10 pr-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
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
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider">Cliente / Documento</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider">Contato / Endereço</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-right">Saldo Devedor</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2D333B]">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-[#9BA1A6]">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-[#9BA1A6]">Nenhum cliente encontrado.</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1C1F26] border border-[#2D333B] flex items-center justify-center text-[10px] font-bold text-[#FF6B00]">
                          {c.nome[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#F8F9FA]">{c.nome}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-[#9BA1A6] font-mono">{c.cpf_cnpj}</p>
                            {c.moto_ano && (
                              <span className="text-[10px] bg-[#FF6B00]/10 text-[#FF6B00] px-1.5 py-0.5 rounded border border-[#FF6B00]/20 font-bold uppercase">
                                {c.moto_ano}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[10px] text-[#9BA1A6]">
                          <Phone className="w-3 h-3 text-[#FF6B00]" />
                          {c.telefone}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[#9BA1A6]">
                          <MapPin className="w-3 h-3 text-[#FF6B00]" />
                          <span className="truncate max-w-[200px]">{c.endereco}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${c.saldo_devedor > 0 ? 'bg-[#FF4D4D]/10 text-[#FF4D4D] border-[#FF4D4D]/20' : 'bg-[#27C485]/10 text-[#27C485] border-[#27C485]/20'}`}>
                        R$ {c.saldo_devedor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openModal(c)}
                          className="p-1.5 hover:bg-white/5 rounded text-[#9BA1A6] hover:text-[#F8F9FA]"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => confirmDelete(c.id)}
                          className="p-1.5 hover:bg-[#FF4D4D]/10 rounded text-[#FF4D4D]"
                          title="Excluir"
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="card w-full max-w-lg p-8 relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-[#9BA1A6] hover:text-[#F8F9FA]"><X className="w-6 h-6" /></button>
            <h2 className="text-2xl font-bold text-[#F8F9FA] mb-6">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Nome Completo</label>
                <input 
                  required
                  type="text"
                  className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                  value={formData.nome}
                  onChange={e => setFormData({...formData, nome: e.target.value})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Moto e Ano</label>
                <input 
                  type="text"
                  placeholder="Ex: Honda CB 300 - 2022"
                  className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                  value={formData.moto_ano}
                  onChange={e => setFormData({...formData, moto_ano: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">CPF / CNPJ</label>
                  <input 
                    required
                    type="text"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.cpf_cnpj}
                    onChange={e => setFormData({...formData, cpf_cnpj: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Telefone</label>
                  <input 
                    required
                    type="text"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.telefone}
                    onChange={e => setFormData({...formData, telefone: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Endereço</label>
                <input 
                  required
                  type="text"
                  className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                  value={formData.endereco}
                  onChange={e => setFormData({...formData, endereco: e.target.value})}
                />
              </div>
              
              <div className="flex gap-4 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-[#2D333B] rounded-lg text-[#9BA1A6] font-medium hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="btn-primary flex-1 px-4 py-2 rounded-lg font-bold"
                >
                  {editingClient ? 'Atualizar Cliente' : 'Salvar Cliente'}
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
            <h2 className="text-xl font-bold text-[#F8F9FA] text-center mb-2">Excluir Cliente</h2>
            <p className="text-[#9BA1A6] text-center text-sm mb-8">
              Tem certeza que deseja excluir permanentemente este cliente? Esta ação não pode ser desfeita.
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

      {/* Panic Modal */}
      {isPanicModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-8 border-red-500/50 shadow-2xl shadow-red-900/20">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-white text-center mb-2 uppercase tracking-tighter">Atenção Total</h2>
            <p className="text-[#9BA1A6] text-center text-sm mb-8">
              Você está prestes a <span className="text-red-500 font-bold uppercase">Deletar Todos</span> os seus clientes. 
              Esta ação é permanente e não pode ser desfeita. 
              Deseja continuar com a limpeza total da base?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsPanicModalOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-[#1C1F26] text-[#9BA1A6] font-bold text-xs uppercase transition-colors"
                disabled={isImporting}
              >
                Cancelar
              </button>
              <button 
                onClick={handlePanicReset}
                className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-bold text-xs uppercase hover:bg-red-700 shadow-lg shadow-red-900/40 transition-all flex items-center justify-center gap-2"
                disabled={isImporting}
              >
                {isImporting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  'ZERAR TUDO'
                )}
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
