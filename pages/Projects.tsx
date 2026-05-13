import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

interface Project {
    id: string;
    name: string;
    status: string;
    budget: number;
    location: string;
    latitude?: number;
    longitude?: number;
    custom_data?: any;
    created_at: string;
}

const Projects: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isMapView = searchParams.get('view') === 'map';
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [customFields, setCustomFields] = useState<any[]>([]);
    const [formData, setFormData] = useState<any>({});
    const [basicData, setBasicData] = useState({ name: '', location: '', budget: '', latitude: '', longitude: '' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [progressMap, setProgressMap] = useState<{ [key: string]: number }>({});

    useEffect(() => {
        fetchProjects();
        fetchCustomFields();
    }, []);

    const fetchProjects = async () => {
        try {
            const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setProjects(data || []);

            // Fetch Financial Data for Progress
            const { data: meas } = await supabase.from('project_measurements').select('project_id, value');
            const { data: adds } = await supabase.from('project_additives').select('project_id, value');

            const newProgressMap: { [key: string]: number } = {};
            data?.forEach(p => {
                const pMeas = meas?.filter((m: any) => m.project_id === p.id).reduce((s: number, m: any) => s + Number(m.value), 0) || 0;
                const pAdds = adds?.filter((a: any) => a.project_id === p.id).reduce((s: number, a: any) => s + Number(a.value), 0) || 0;
                const total = (Number(p.budget) || 0) + pAdds;
                newProgressMap[p.id] = total > 0 ? (pMeas / total) * 100 : 0;
            });
            setProgressMap(newProgressMap);

        } catch (error) {
            console.error('Erro ao buscar obras:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomFields = async () => {
        const { data } = await supabase.from('project_field_definitions').select('*').order('order_index');
        setCustomFields(data || []);
    };

    const handleEditProject = (proj: Project, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent navigation
        setEditingId(proj.id);
        setBasicData({
            name: proj.name,
            location: proj.location || '',
            budget: proj.budget ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(proj.budget) : '',
            latitude: proj.latitude?.toString() || '',
            longitude: proj.longitude?.toString() || ''
        });
        setFormData(proj.custom_data || {});
        setIsModalOpen(true);
    };

    const handleDeleteProject = async (projId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("ATENÇÃO: Deseja realmente excluir esta obra?\nIsso apagará permanentemente todos os aditivos, medições e documentos vinculados.")) return;

        const { error } = await supabase.from('projects').delete().eq('id', projId);

        if (error) {
            alert('Erro ao excluir obra: ' + error.message);
        } else {
            fetchProjects();
        }
    };

    const handleSaveProject = async () => {
        if (!basicData.name) return alert('O nome da obra é obrigatório.');

        // Validate required custom fields
        for (const field of customFields) {
            const rawValue = String(formData[field.id] || '');
            const cleanValue = field.mask ? rawValue.replace(/[^0-9a-zA-Z]/g, '') : rawValue;
            const checkLen = cleanValue.length;

            if (field.required && !cleanValue) {
                return alert(`O campo ${field.label} é obrigatório.`);
            }
            // Validate Exact Length
            if (field.validation_rules?.exact_length && cleanValue) {
                let allowed = field.validation_rules.exact_length;
                if (typeof allowed === 'string') {
                    allowed = allowed.split(',').map((v: string) => parseInt(v.trim()));
                }
                if (Array.isArray(allowed) && !allowed.includes(checkLen)) {
                    return alert(`O campo ${field.label} deve ter ${allowed.join(' ou ')} caracteres.`);
                }
            }
            // Validate Min Length
            if (field.validation_rules?.min_length && cleanValue) {
                if (checkLen < field.validation_rules.min_length) {
                    return alert(`O campo ${field.label} deve ter no mínimo ${field.validation_rules.min_length} caracteres.`);
                }
            }
            // Validate Max Length
            if (field.validation_rules?.max_length && cleanValue) {
                if (checkLen > field.validation_rules.max_length) {
                    return alert(`O campo ${field.label} deve ter no máximo ${field.validation_rules.max_length} caracteres.`);
                }
            }
        }

        // Parse Budget: "R$ 1.000,00" -> 1000.00
        const budgetString = basicData.budget.replace(/[^0-9,]/g, '').replace(',', '.');
        const budgetVal = parseFloat(budgetString) || 0;

        const projectPayload = {
            name: basicData.name,
            location: basicData.location,
            budget: budgetVal,
            latitude: parseFloat(basicData.latitude) || null,
            longitude: parseFloat(basicData.longitude) || null,
            status: editingId ? undefined : 'pending', // Don't reset status on edit
            custom_data: formData
        };

        let result;
        if (editingId) {
            result = await supabase.from('projects').update(projectPayload).eq('id', editingId);
        } else {
            result = await supabase.from('projects').insert([projectPayload]);
        }

        if (result.error) {
            alert('Erro ao salvar obra: ' + result.error.message);
        } else {
            alert(editingId ? 'Obra atualizada com sucesso!' : 'Obra cadastrada com sucesso!');
            closeModal();
            fetchProjects();
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setBasicData({ name: '', location: '', budget: '', latitude: '', longitude: '' });
        setFormData({});
    };

    const handleBudgetChange = (val: string) => {
        // Auto-format currency
        const digits = val.replace(/\D/g, "");
        if (!digits) {
            setBasicData({ ...basicData, budget: '' });
            return;
        }
        const numberVal = parseInt(digits) / 100;
        const formatted = numberVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        setBasicData({ ...basicData, budget: formatted });
    };

    return (
        <div className="p-6 lg:p-10 max-w-[1400px] mx-auto pb-32">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-[#111318] dark:text-white text-3xl font-black tracking-tight">Obras e Projetos</h2>
                    <p className="text-[#616f89] dark:text-gray-400 text-sm font-medium">Gestão e acompanhamento de obras públicas.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2">
                    <span className="material-symbols-outlined">add_business</span>
                    Nova Obra
                </button>
            </div>

            {/* VIEW MODE: LIST ONLY (Requested) */}
            {/* VIEW MODE TOGGLE CONTENT */}
            {isMapView ? (
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden h-[calc(100vh-240px)] min-h-[500px] relative z-0">
                    {projects.length > 0 && (
                        <MapContainer
                            center={[-14.2350, -51.9253]}
                            zoom={4}
                            style={{ height: '100%', width: '100%' }}
                        >
                            {/* Satellite Tiles with Auto-Scaling beyond native zoom */}
                            <TileLayer
                                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                maxNativeZoom={17}
                                maxZoom={22}
                            />

                            <MapBounds markers={projects} />

                            {projects.map(proj => {
                                if (!proj.latitude || !proj.longitude) return null;
                                return (
                                    <Marker
                                        key={proj.id}
                                        position={[proj.latitude, proj.longitude]}
                                        eventHandlers={{
                                            click: () => {
                                                navigate(`/projects/${proj.id}`);
                                            },
                                        }}
                                    >
                                        <Popup>
                                            <div className="text-center">
                                                <h3 className="font-bold text-sm mb-1">{proj.name}</h3>
                                                <p className="text-xs text-gray-500 mb-2">{proj.location}</p>
                                                <button
                                                    onClick={() => navigate(`/projects/${proj.id}`)}
                                                    className="bg-primary text-white text-[10px] px-2 py-1 rounded uppercase font-bold"
                                                >
                                                    Ver Detalhes
                                                </button>
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    )}
                    {projects.length === 0 && (
                        <div className="flex h-full items-center justify-center text-gray-400">Nenhuma obra para exibir no mapa.</div>
                    )}
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 dark:bg-slate-900/50 border-b dark:border-slate-700">
                            <tr>
                                <th className="p-4 text-xs font-black uppercase text-gray-400">Obra / Projeto</th>
                                <th className="p-4 text-xs font-black uppercase text-gray-400">Localização</th>
                                <th className="p-4 text-xs font-black uppercase text-gray-400 w-1/4">Status (Execução)</th>
                                <th className="p-4 text-xs font-black uppercase text-gray-400 text-right">Orçamento</th>
                                <th className="p-4 text-xs font-black uppercase text-gray-400 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {loading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-400">Carregando obras...</td></tr>
                            ) : projects.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="material-symbols-outlined text-gray-300 text-5xl mb-4">construction</span>
                                            <p className="text-gray-500 font-medium">Nenhuma obra cadastrada ainda.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                projects.map(proj => (
                                    <tr
                                        key={proj.id}
                                        onClick={() => navigate(`/projects/${proj.id}`)}
                                        className="hover:bg-blue-50/50 dark:hover:bg-slate-700/30 cursor-pointer group transition-colors"
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 flex-shrink-0">
                                                    <span className="material-symbols-outlined">apartment</span>
                                                </div>
                                                <span className="font-bold text-gray-900 dark:text-white uppercase text-sm">{proj.name}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-gray-500 uppercase font-medium">
                                            <div className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[16px]">location_on</span>
                                                {proj.location || 'N/I'}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="w-full max-w-[150px]">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase">{proj.status === 'completed' ? 'Finalizado' : 'Em Andamento'}</span>
                                                    <span className="text-[10px] font-bold text-blue-600">{(progressMap[proj.id] || 0).toFixed(0)}%</span>
                                                </div>
                                                <div className="w-full bg-gray-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${proj.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                                                        style={{ width: `${Math.min(100, progressMap[proj.id] || 0)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-mono font-bold text-gray-900 dark:text-white text-sm">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(proj.budget || 0)}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => handleEditProject(proj, e)} className="p-2 hover:bg-white hover:text-primary rounded-lg transition-colors text-gray-400" title="Editar">
                                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                                </button>
                                                <button onClick={(e) => handleDeleteProject(proj.id, e)} className="p-2 hover:bg-white hover:text-red-500 rounded-lg transition-colors text-gray-400" title="Excluir">
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de Cadastro */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[50] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-[35px] p-10 max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <h3 className="text-2xl font-black mb-6 flex items-center gap-3"><span className="material-symbols-outlined text-primary">add_business</span> {editingId ? 'Editar Obra' : 'Cadastrar Nova Obra'}</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="space-y-4">
                                <h4 className="text-xs font-black uppercase text-gray-400 border-b pb-2 mb-4">Dados Básicos</h4>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Nome da Obra</label>
                                    <input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-black text-lg uppercase" placeholder="EX: PAVIMENTAÇÃO RUA X" value={basicData.name} onChange={e => setBasicData({ ...basicData, name: e.target.value.toUpperCase() })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Localização</label>
                                        <input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-bold uppercase" placeholder="BAIRRO CENTRO" value={basicData.location} onChange={e => setBasicData({ ...basicData, location: e.target.value.toUpperCase() })} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Orçamento (R$)</label>
                                        <input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-mono text-emerald-600 font-black" placeholder="R$ 0,00" value={basicData.budget} onChange={e => handleBudgetChange(e.target.value)} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                                    <div className="col-span-full mb-1 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-blue-500 text-sm">public</span>
                                        <span className="text-[10px] font-black uppercase text-blue-500">Coordenadas Geográficas (Decimal)</span>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Latitude</label>
                                        <input type="number" step="any" className="w-full bg-white dark:bg-slate-900 border p-2 rounded-lg font-mono text-xs" placeholder="-12.345678" value={basicData.latitude} onChange={e => setBasicData({ ...basicData, latitude: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Longitude</label>
                                        <input type="number" step="any" className="w-full bg-white dark:bg-slate-900 border p-2 rounded-lg font-mono text-xs" placeholder="-56.789012" value={basicData.longitude} onChange={e => setBasicData({ ...basicData, longitude: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-black uppercase text-gray-400 border-b pb-2 mb-4">Informações Adicionais</h4>
                                {customFields.length === 0 ? <p className="text-sm text-gray-400 italic">Nenhum campo personalizado configurado.</p> :
                                    customFields.map(field => (
                                        <div key={field.id}>
                                            <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                                            {field.mask ? (
                                                <input
                                                    className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-medium"
                                                    placeholder={field.mask}
                                                    value={formData[field.id] || ''}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        // Helper to restore simple masking visually if needed, 
                                                        // but for 'automated' checking we mostly rely on simple append or use provided library if user allows.
                                                        // USER opted for manual simple mask in previous Steps.
                                                        // Re-implementing basic 1-char forward mask logic:
                                                        const format = (v: string, m: string) => {
                                                            let i = 0; let r = '';
                                                            let vClean = v.replace(/[^0-9a-zA-Z]/g, '');
                                                            for (let j = 0; j < m.length; j++) {
                                                                if (i >= vClean.length) break;
                                                                if (['9', 'a', '*'].includes(m[j])) {
                                                                    if (m[j] === '9' && !/[0-9]/.test(vClean[i])) break;
                                                                    if (m[j] === 'a' && !/[a-zA-Z]/.test(vClean[i])) break;
                                                                    r += vClean[i++];
                                                                } else {
                                                                    r += m[j];
                                                                    // If input already has this char at this pos (from delete/paste), skip check, just loop mask
                                                                }
                                                            }
                                                            return r;
                                                        };
                                                        setFormData({ ...formData, [field.id]: format(raw, field.mask) });
                                                    }}
                                                />
                                            ) : (
                                                <input
                                                    maxLength={field.validation_rules?.max_length}
                                                    type={field.field_type === 'number' ? 'number' : 'text'}
                                                    className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-medium"
                                                    value={formData[field.id] || ''}
                                                    onChange={e => setFormData({ ...formData, [field.id]: e.target.value })}
                                                />
                                            )}
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        <div className="flex gap-4 pt-6 border-t dark:border-slate-700">
                            <button onClick={closeModal} className="flex-1 py-4 font-bold text-gray-400 uppercase tracking-widest text-xs">Cancelar</button>
                            <button onClick={handleSaveProject} className="flex-2 px-12 py-4 bg-primary text-white font-black rounded-2xl shadow-lg uppercase tracking-widest text-xs hover:scale-105 transition-all">{editingId ? 'Salvar Alterações' : 'Salvar Obra'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper component to auto-fit bounds
const MapBounds = ({ markers }: { markers: Project[] }) => {
    const map = useMap();

    useEffect(() => {
        if (!markers || markers.length === 0) return;

        const validMarkers = markers.filter(m => m.latitude && m.longitude);
        if (validMarkers.length === 0) return;

        const bounds = new L.LatLngBounds(validMarkers.map(m => [m.latitude!, m.longitude!]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }, [markers, map]);

    return null;
};

export default Projects;
