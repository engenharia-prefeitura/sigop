
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isNoRowsError } from '../lib/supabaseCompat';

interface Profile {
    id: string;
    email: string;
    full_name: string;
    role_title: string;
    crea: string;
    avatar_url: string;
    is_admin: boolean;
    is_active: boolean;
}

const Users: React.FC = () => {
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<'active' | 'inactive'>('active');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form Data com valores iniciais seguros (string vazia, nunca null/undefined)
    const [formData, setFormData] = useState({
        full_name: '',
        role_title: '',
        crea: '',
        is_admin: false,
        email: '',
        password: ''
    });

    useEffect(() => {
        checkAdmin();
        fetchUsers();
    }, []);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
            if (error && !isNoRowsError(error)) throw error;
            setIsAdmin(!!data?.is_admin);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('profiles').select('*').order('full_name');
            if (error) throw error;
            // Garantir que is_active venha corretamente (se null, assume true)
            // Mapear
            const mappedUsers = (data || []).map((u: any) => ({
                ...u,
                is_active: u.is_active !== false
            }));

            // Ordenar: Admin Primeiro, depois Alfabético
            mappedUsers.sort((a: any, b: any) => {
                if (a.is_admin && !b.is_admin) return -1;
                if (!a.is_admin && b.is_admin) return 1;
                return (a.full_name || '').localeCompare(b.full_name || '');
            });

            setUsers(mappedUsers);
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (user: Profile) => {
        setEditingId(user.id);
        // Garantir que nenhum campo seja null/undefined ao jogar pro Form
        setFormData({
            full_name: user.full_name || '',
            role_title: user.role_title || '',
            crea: user.crea || '',
            is_admin: !!user.is_admin,
            email: user.email || '',
            password: ''
        });
        setIsModalOpen(true);
    };

    const handleNew = () => {
        setEditingId(null);
        setFormData({
            full_name: '', role_title: '', crea: '', is_admin: false, email: '', password: ''
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        try {
            if (!formData.full_name || !formData.email) return alert('Nome e Email são obrigatórios');
            if (!editingId && !formData.password) return alert('Senha é obrigatória para novos usuários');

            // NOVO USUÁRIO via RPC Direto
            if (!editingId) {
                const { error } = await supabase.rpc('create_new_user', {
                    p_email: formData.email,
                    p_password: formData.password,
                    p_full_name: formData.full_name,
                    p_role_title: formData.role_title || '',
                    p_crea: formData.crea || '',
                    p_is_admin: formData.is_admin
                });

                if (error) {
                    console.error(error);
                    throw new Error(error.message);
                }

                alert('Usuário criado com sucesso!');
                setIsModalOpen(false);
                fetchUsers(); // Recarrega lista imediatamente
                return;
            }

            // EDIÇÃO
            const profileUpdates = {
                full_name: formData.full_name,
                role_title: formData.role_title,
                crea: formData.crea,
                is_admin: formData.is_admin
            };

            await supabase.from('profiles').update(profileUpdates).eq('id', editingId);

            if (formData.password || formData.email !== users.find(u => u.id === editingId)?.email) {
                await supabase.from('admin_tasks').insert({
                    task_type: 'update_auth',
                    payload: {
                        userId: editingId,
                        email: formData.email !== users.find(u => u.id === editingId)?.email ? formData.email : undefined,
                        password: formData.password ? formData.password : undefined
                    }
                });
                alert('Perfil atualizado e solicitação de senha/email enviada!');
            } else {
                alert('Perfil atualizado com sucesso!');
            }

            // Update local otimista e reordenar se necessário (mas fetchUsers é melhor)
            fetchUsers();
            setIsModalOpen(false);

        } catch (err: any) {
            alert('Erro ao salvar: ' + err.message);
        }
    };

    const handleToggleStatus = async (user: Profile) => {
        const action = user.is_active ? 'desabilitar' : 'reativar';
        if (!confirm(`Deseja realmente ${action} o acesso deste usuário?`)) return;

        try {
            const newStatus = !user.is_active;
            const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', user.id);

            if (error) throw error;

            setUsers(users.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u));
            alert(`Usuário ${newStatus ? 'reativado' : 'desabilitado'} com sucesso.`);
        } catch (err: any) {
            alert('Erro ao alterar status: ' + err.message);
        }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.role_title || '').toLowerCase().includes(search.toLowerCase());
        const matchesView = viewMode === 'active' ? u.is_active : !u.is_active;
        return matchesSearch && matchesView;
    });

    return (
        <div className="p-6 lg:p-10 max-w-[1200px] mx-auto animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-[#111318] dark:text-white text-3xl font-black tracking-tight leading-tight">Equipe & Usuários</h2>
                        <p className="text-[#616f89] dark:text-gray-400 text-sm font-medium">Gerencie os membros do sistema.</p>
                    </div>
                    <div className="flex gap-3">
                        <input
                            className="pl-4 pr-4 py-3 bg-white dark:bg-gray-800 border rounded-xl w-64 outline-none focus:ring-2 ring-primary/20 font-medium"
                            placeholder="Buscar usuário..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {isAdmin && (
                            <button onClick={handleNew} className="px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center gap-2">
                                Novo Usuário
                            </button>
                        )}
                    </div>
                </div>

                {/* Tabs de Filtro */}
                <div className="flex gap-4 border-b border-gray-200">
                    <button
                        onClick={() => setViewMode('active')}
                        className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${viewMode === 'active' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                    >
                        Usuários Ativos
                    </button>
                    <button
                        onClick={() => setViewMode('inactive')}
                        className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors ${viewMode === 'inactive' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                    >
                        Desabilitados
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? <p className="text-gray-500">Carregando...</p> : filteredUsers.length === 0 ? <p className="text-gray-400 italic">Nenhum usuário encontrado nesta lista.</p> : filteredUsers.map((user) => (
                        <div
                            key={user.id}
                            className={`rounded-2xl border p-6 flex flex-col gap-6 shadow-sm hover:shadow-md transition-all 
                                ${!user.is_active
                                    ? 'border-red-100 bg-red-50/10'
                                    : user.is_admin
                                        ? 'bg-purple-50/40 border-purple-200 dark:bg-purple-900/10 dark:border-purple-800' // Estilo Admin
                                        : 'bg-white dark:bg-gray-800 border-gray-200' // Estilo Normal
                                }`}
                        >

                            <div className="flex items-center gap-4">
                                <div className={`size-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-xs 
                                    ${!user.is_active ? 'bg-red-100 text-red-500' : user.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-primary/10 text-primary'}`}>
                                    {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??'}
                                </div>
                                <div>
                                    <h3 className={`font-bold ${!user.is_active ? 'text-gray-500 line-through' : ''}`}>{user.full_name}</h3>
                                    <p className="text-xs text-gray-500">{user.email}</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 font-bold uppercase">Cargo: <span className="text-gray-800">{user.role_title}</span></p>
                                <p className="text-xs text-gray-500 font-bold uppercase">Admin: <span className={user.is_admin ? "text-purple-600" : "text-gray-800"}>{user.is_admin ? 'Sim' : 'Não'}</span></p>
                                <p className="text-xs text-gray-500 font-bold uppercase">Status: <span className={user.is_active ? "text-green-600" : "text-red-500"}>{user.is_active ? 'Ativo' : 'Desabilitado'}</span></p>
                            </div>
                            {isAdmin && (
                                <div className="flex gap-2 mt-auto pt-4">
                                    <button onClick={() => handleEdit(user)} className="flex-1 bg-gray-50 hover:bg-primary hover:text-white text-gray-600 font-bold py-2 rounded-lg text-xs transition-colors">Editar</button>
                                    <button
                                        onClick={() => handleToggleStatus(user)}
                                        className={`flex-1 font-bold py-2 rounded-lg text-xs transition-colors ${user.is_active ? 'bg-gray-50 hover:bg-orange-500 hover:text-white text-gray-600' : 'bg-green-50 hover:bg-green-600 hover:text-white text-green-700'}`}
                                    >
                                        {user.is_active ? 'Desabilitar' : 'Reativar'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full">
                        <h3 className="text-xl font-black mb-6">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                        <div className="space-y-3">
                            <label className="block">
                                <span className="text-xs font-bold uppercase text-gray-400">Nome Completo *</span>
                                <input className="w-full border p-2 rounded-lg font-bold mt-1" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold uppercase text-gray-400">Email *</span>
                                <input className="w-full border p-2 rounded-lg font-bold mt-1" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold uppercase text-gray-400">Senha</span>
                                <input type="password" className="w-full border p-2 rounded-lg font-bold mt-1" placeholder={editingId ? "Manter atual" : "Senha"} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold uppercase text-gray-400">Cargo</span>
                                <input className="w-full border p-2 rounded-lg font-bold mt-1" value={formData.role_title} onChange={e => setFormData({ ...formData, role_title: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="text-xs font-bold uppercase text-gray-400">CREA</span>
                                <input className="w-full border p-2 rounded-lg font-bold mt-1" value={formData.crea} onChange={e => setFormData({ ...formData, crea: e.target.value })} />
                            </label>
                            <label className="flex items-center gap-2 pt-2">
                                <input type="checkbox" checked={formData.is_admin} onChange={e => setFormData({ ...formData, is_admin: e.target.checked })} />
                                <span className="text-sm font-bold">Admin</span>
                            </label>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancelar</button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-primary text-white font-bold rounded-xl">Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Users;
