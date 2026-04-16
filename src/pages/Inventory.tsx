import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, doc, setDoc, writeBatch, getDocs, where, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Package, Search, Plus, Upload, Download, AlertCircle, Trash2, Edit2, X, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { UserProfile } from '../App';

interface Produto {
  id: string;
  descricao: string;
  codigo_barras: string;
  ncm: string;
  marca: string;
  unidade: string;
  qtd_atual: number;
  preco_venda: number;
  preco_custo: number;
  data_cadastro?: any;
}

export function Inventory({ profile }: { profile: UserProfile | null }) {
  const [products, setProducts] = useState<Produto[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPanicModalOpen, setIsPanicModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
  const [formData, setFormData] = useState({
    descricao: '',
    codigo_barras: '',
    ncm: '',
    marca: '',
    unidade: 'UN',
    qtd_atual: 0,
    preco_venda: 0,
    preco_custo: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'estoque'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Produto));
      setProducts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openModal = (product?: Produto) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        descricao: product.descricao,
        codigo_barras: product.codigo_barras,
        ncm: product.ncm || '',
        marca: product.marca || '',
        unidade: product.unidade || 'UN',
        qtd_atual: product.qtd_atual,
        preco_venda: product.preco_venda,
        preco_custo: product.preco_custo
      });
    } else {
      setEditingProduct(null);
      setFormData({
        descricao: '',
        codigo_barras: '',
        ncm: '',
        marca: '',
        unidade: 'UN',
        qtd_atual: 0,
        preco_venda: 0,
        preco_custo: 0
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        const prodRef = doc(db, 'estoque', editingProduct.id);
        await setDoc(prodRef, formData, { merge: true });
      } else {
        const prodRef = doc(collection(db, 'estoque'));
        await setDoc(prodRef, formData);
      }
      setIsModalOpen(false);
      setNotification({ message: editingProduct ? 'Item atualizado!' : 'Item criado!', type: 'success' });
    } catch (e) {
      console.error(e);
      setNotification({ message: 'Erro ao salvar produto.', type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'estoque', itemToDelete));
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      setNotification({ message: 'Item excluído com sucesso!', type: 'success' });
    } catch (e) {
      console.error(e);
      setNotification({ message: 'Erro ao excluir produto.', type: 'error' });
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
      const snap = await getDocs(collection(db, 'estoque'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setIsPanicModalOpen(false);
      setNotification({ message: 'Estoque totalmente zerado!', type: 'success' });
    } catch (e) {
      console.error(e);
      setNotification({ message: 'Erro ao zerar estoque.', type: 'error' });
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
        
        const allData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        let headerRowIndex = -1;
        let colMap = { desc: -1, ncm: -1, venda: -1, barras: -1, unidade: -1, custo: -1 };

        // Dynamic Header Detection
        for (let i = 0; i < Math.min(allData.length, 30); i++) {
          const row = allData[i];
          if (!row || !Array.isArray(row)) continue;
          
          // Use Array.from to handle sparse arrays and ensure we have a dense array of strings
          const rowStr = Array.from(row).map(c => String(c || '').toLowerCase().trim());
          const descIdx = rowStr.findIndex(c => c && c.includes('descrição'));
          
          if (descIdx !== -1) {
            headerRowIndex = i;
            colMap = {
              desc: descIdx,
              ncm: rowStr.findIndex(c => c === 'ncm'),
              venda: rowStr.findIndex(c => c && c.includes('venda r$')),
              barras: rowStr.findIndex(c => c && (c.includes('código barras') || c.includes('cod. barras'))),
              unidade: rowStr.findIndex(c => c === 'emb' || c === 'unidade'),
              custo: rowStr.findIndex(c => c && c.includes('custo r$'))
            };
            break;
          }
        }

        if (headerRowIndex === -1) {
          throw new Error('Cabeçalho "Descrição" não encontrado no arquivo.');
        }

        const batch = writeBatch(db);
        let importedCount = 0;
        
        // Helper to parse currency reliably
        const parseCurrency = (val: any) => {
          if (val === undefined || val === null || val === '') return 0;
          if (typeof val === 'number') return val;
          const cleaned = String(val).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
          return Number(cleaned) || 0;
        };

        const dataRows = allData.slice(headerRowIndex + 1);
        
        for (const row of dataRows) {
          const rowDesc = colMap.desc !== -1 ? String(row[colMap.desc] || '') : '';
          
          // Skip empty rows, group headers, and pagination info
          if (!rowDesc || 
              rowDesc.toLowerCase().includes('página') || 
              rowDesc.toLowerCase().startsWith('grupo:') ||
              rowDesc.toLowerCase().includes('mercadorias totalizadas') ||
              rowDesc.trim() === 'Descrição'
          ) continue; 

          let descricao = rowDesc.trim();
          // Remove ID prefix like "2 - "
          descricao = descricao.replace(/^\d+\s*-\s*/, '');

          const ncm = colMap.ncm !== -1 ? String(row[colMap.ncm] || '').trim() : '';
          const preco_venda = colMap.venda !== -1 ? parseCurrency(row[colMap.venda]) : 0;
          const preco_custo = colMap.custo !== -1 ? parseCurrency(row[colMap.custo]) : 0;
          const codigo_barras = colMap.barras !== -1 ? String(row[colMap.barras] || '').trim() : '';
          const unidade = colMap.unidade !== -1 ? String(row[colMap.unidade] || 'UN').trim() : 'UN';

          if (descricao) {
            const productData: any = {
              descricao,
              ncm,
              preco_venda,
              preco_custo,
              unidade,
              marca: 'Importado',
              data_cadastro: new Date().toISOString()
            };

            if (codigo_barras) productData.codigo_barras = codigo_barras;

            // IGNORE ESTOQUE: Only set to 0 if it's a new item or if specifically requested to reset.
            // Using merge: true will keep existing stock if we don't include it.
            // But per user request "ignore a quantidade em estoque", I will explicitly set it to 0 for the import
            // to ensure clean data as their screenshot showed mess there.
            productData.qtd_atual = 0;

            const docId = codigo_barras ? 
              codigo_barras.replace(/[^a-zA-Z0-9]/g, '_') : 
              descricao.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 70);

            batch.set(doc(db, 'estoque', docId), productData, { merge: true });
            importedCount++;
          }
        }

        await batch.commit();
        setNotification({ message: `${importedCount} itens importados/atualizados com sucesso!`, type: 'success' });
      } catch (error: any) {
        console.error('Erro na importação:', error);
        setNotification({ 
          message: error.message || 'Erro ao importar arquivo. Verifique se as colunas estão corretas.', 
          type: 'error' 
        });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredProducts = products.filter(p => 
    (p.descricao?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.codigo_barras?.includes(searchTerm))
  );

  const exportInventory = () => {
    const dataToExport = products.map(p => {
      // Calculate totals, as seen in the image (negative stock results in 0.00 total)
      const totalCusto = p.qtd_atual > 0 ? (p.qtd_atual * p.preco_custo) : 0;
      const totalVenda = p.qtd_atual > 0 ? (p.qtd_atual * p.preco_venda) : 0;

      return {
        'Descrição': p.descricao,
        'Código Barras': p.codigo_barras,
        'NCM': p.ncm || '',
        'Fator': '0,00',
        'Emb': p.unidade || 'UN',
        'Estoque': p.qtd_atual.toLocaleString('pt-BR', { minimumFractionDigits: 3 }),
        'Custo R$': p.preco_custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        'T Custo R$': totalCusto.toLocaleString('pt-BR', { minimumFractionDigits: 6 }),
        'Venda R$': p.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        'T Venda R$': totalVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Set column widths to match the importance/width of the table
    const wscols = [
      { wch: 50 }, // Descricao
      { wch: 20 }, // Cod Barras
      { wch: 12 }, // NCM
      { wch: 8 },  // Fator
      { wch: 8 },  // Emb
      { wch: 12 }, // Estoque
      { wch: 12 }, // Custo
      { wch: 15 }, // T Custo
      { wch: 12 }, // Venda
      { wch: 15 }, // T Venda
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mercadorias");
    XLSX.writeFile(workbook, "relatorio_mercadorias_box_motors.xlsx");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#F8F9FA]">Gestão de Estoque</h1>
          <p className="text-[#9BA1A6] text-sm">Controle de peças e insumos</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Total de Mercadorias</span>
            <span className="text-2xl font-black text-[#FF6B00] leading-none">{products.length}</span>
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
              {isImporting ? 'Importando...' : 'Importar Legacy'}
            </button>
            {profile?.role === 'admin' && (
              <button 
                onClick={() => setIsPanicModalOpen(true)}
                className="px-4 py-2 rounded-lg text-xs font-black bg-red-950/30 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                title="Zerar todo o estoque"
              >
                <AlertCircle className="w-4 h-4" />
                PANICO
              </button>
            )}
            <button 
              onClick={exportInventory}
              className="btn-outline px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <button 
              onClick={() => openModal()}
              className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Novo Item
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-[#9BA1A6] absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Buscar por descrição ou código de barras..."
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
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider">Produto</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider">Código</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-center">Qtd</th>
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-right">Venda</th>
                {profile?.role === 'admin' && (
                  <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-right">Custo</th>
                )}
                <th className="px-6 py-4 text-[11px] font-bold text-[#9BA1A6] uppercase tracking-wider text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2D333B]">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#9BA1A6]">Carregando...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#9BA1A6]">Nenhum produto encontrado.</td></tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#F8F9FA]">{p.descricao}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-[#1C1F26] text-[#9BA1A6] px-1.5 py-0.5 rounded border border-[#2D333B] font-bold uppercase">
                          {p.marca || 'Sem Marca'}
                        </span>
                        <span className="text-[10px] text-[#9BA1A6] uppercase font-bold">NCM: {p.ncm}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-[#9BA1A6]">{p.codigo_barras}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        p.qtd_atual <= 0 ? 'bg-[#FF4D4D]/10 text-[#FF4D4D] border-[#FF4D4D]/20' : 
                        p.qtd_atual < 5 ? 'bg-[#FF6B00]/10 text-[#FF6B00] border-[#FF6B00]/20' : 
                        'bg-[#27C485]/10 text-[#27C485] border-[#27C485]/20'
                      }`}>
                        {p.qtd_atual} un
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-[#F8F9FA] font-mono">
                      R$ {p.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    {profile?.role === 'admin' && (
                      <td className="px-6 py-4 text-right text-[#9BA1A6] font-mono text-sm">
                        R$ {p.preco_custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    )}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => openModal(p)}
                          className="p-1.5 hover:bg-white/5 rounded text-[#9BA1A6] hover:text-[#F8F9FA]"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {profile?.role === 'admin' && (
                          <button 
                            onClick={() => confirmDelete(p.id)}
                            className="p-1.5 hover:bg-[#FF4D4D]/10 rounded text-[#FF4D4D]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
            <h2 className="text-2xl font-bold text-[#F8F9FA] mb-6">{editingProduct ? 'Editar Item' : 'Novo Item'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Descrição do Produto</label>
                <input 
                  required
                  type="text"
                  className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                  value={formData.descricao}
                  onChange={e => setFormData({...formData, descricao: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Marca</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.marca}
                    onChange={e => setFormData({...formData, marca: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Unidade (Emb.)</label>
                  <input 
                    type="text"
                    placeholder="Ex: UN, PC, LT"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.unidade}
                    onChange={e => setFormData({...formData, unidade: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Código de Barras</label>
                  <input 
                    required
                    type="text"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.codigo_barras}
                    onChange={e => setFormData({...formData, codigo_barras: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">NCM</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.ncm}
                    onChange={e => setFormData({...formData, ncm: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Qtd Inicial</label>
                  <input 
                    required
                    type="number"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.qtd_atual}
                    onChange={e => setFormData({...formData, qtd_atual: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Custo (R$)</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.preco_custo}
                    onChange={e => setFormData({...formData, preco_custo: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9BA1A6] uppercase tracking-widest">Venda (R$)</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    className="w-full px-4 py-2 bg-[#0A0B0E] border border-[#2D333B] rounded-lg text-[#F8F9FA] focus:ring-2 focus:ring-[#FF6B00] outline-none transition-all"
                    value={formData.preco_venda}
                    onChange={e => setFormData({...formData, preco_venda: Number(e.target.value)})}
                  />
                </div>
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
                  {editingProduct ? 'Atualizar Item' : 'Criar Item'}
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
            <h2 className="text-xl font-bold text-[#F8F9FA] text-center mb-2">Excluir Item</h2>
            <p className="text-[#9BA1A6] text-center text-sm mb-8">
              Tem certeza que deseja excluir permanentemente este item do estoque?
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
      {/* Panic Modal */}
      {isPanicModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-8 border-red-500/50 shadow-2xl shadow-red-900/20">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-white text-center mb-2 uppercase tracking-tighter">Atenção Total</h2>
            <p className="text-[#9BA1A6] text-center text-sm mb-8">
              Você está prestes a <span className="text-red-500 font-bold uppercase">Deletar Tudo</span> do seu estoque. 
              Esta ação é permanente e não pode ser desfeita. 
              Deseja continuar com a limpeza total para uma nova importação?
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
    </div>
  );
}
