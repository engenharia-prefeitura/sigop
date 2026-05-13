import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { isRelationUnavailable, rememberMissingRelation } from '../lib/supabaseCompat';
import { useAuth } from './AuthContext';

// --- TYPES ---
interface AgendaEvent {
    id: string;
    title: string;
    description?: string;
    start_time: string;
    end_time?: string;
    is_all_day: boolean;
    category: 'meeting' | 'deadline' | 'site_visit' | 'personal';
    reminder_sent?: boolean;
}

const CATEGORY_STYLES = {
    meeting: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Reunião', icon: 'groups' },
    deadline: { bg: 'bg-red-100', text: 'text-red-700', label: 'Prazo', icon: 'timer' },
    site_visit: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Visita', icon: 'engineering' },
    personal: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Pessoal', icon: 'person' },
};

// --- COMPONENT: Agenda Drawer ---
interface AgendaDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AgendaDrawer: React.FC<AgendaDrawerProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [events, setEvents] = useState<AgendaEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [agendaAvailable, setAgendaAvailable] = useState(() => !isRelationUnavailable('user_agenda_events'));

    // New Event Form State
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newEvent, setNewEvent] = useState({
        title: '',
        category: 'meeting' as any,
        time: '09:00',
        duration: 60, // minutes
    });

    useEffect(() => {
        if (user && isOpen && agendaAvailable) {
            fetchEvents();
        }
    }, [user, selectedDate, isOpen, agendaAvailable]);

    const fetchEvents = async () => {
        if (!agendaAvailable) return;
        setLoading(true);
        // Fetch for the selected day (Start to End of day)
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
            .from('user_agenda_events')
            .select('*')
            .eq('user_id', user?.id)
            .gte('start_time', startOfDay.toISOString())
            .lte('start_time', endOfDay.toISOString())
            .order('start_time', { ascending: true });

        if (rememberMissingRelation('user_agenda_events', error)) {
            setAgendaAvailable(false);
            setEvents([]);
            setLoading(false);
            return;
        }

        if (!error) {
            setEvents(data || []);
        }
        setLoading(false);
    };

    const handleSaveEvent = async () => {
        if (!agendaAvailable) {
            alert('Agenda indisponivel neste projeto ate a tabela user_agenda_events ser criada no Supabase.');
            return;
        }
        if (!newEvent.title) return alert("Digite um título");

        // Construct Start Time
        const start = new Date(selectedDate);
        const [hours, mins] = newEvent.time.split(':').map(Number);
        start.setHours(hours, mins, 0, 0);

        // Construct End Time
        const end = new Date(start.getTime() + newEvent.duration * 60000);

        const payload = {
            user_id: user?.id,
            title: newEvent.title,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            category: newEvent.category,
            is_all_day: false,
            reminder_sent: false, // Force reset to false
        };

        console.log("[Agenda] 💾 Salvando evento com payload:", payload);

        let result;
        if (editingId) {
            result = await supabase.from('user_agenda_events').update(payload).eq('id', editingId);
        } else {
            result = await supabase.from('user_agenda_events').insert([payload]);
        }

        const { error } = result;

        if (error) {
            if (rememberMissingRelation('user_agenda_events', error)) {
                setAgendaAvailable(false);
                setEvents([]);
                alert('Agenda indisponivel neste projeto ate a tabela user_agenda_events ser criada no Supabase.');
                return;
            }
            alert("Erro ao salvar evento: " + error.message);
        } else {
            setShowForm(false);
            setEditingId(null);
            setNewEvent({ title: '', category: 'meeting', time: '09:00', duration: 60 });
            fetchEvents();
        }
    };

    const handleEditEvent = (event: AgendaEvent) => {
        const start = new Date(event.start_time);

        // Calculate duration in minutes
        const end = event.end_time ? new Date(event.end_time).getTime() : start.getTime() + 60 * 60000;
        const duration = Math.round((end - start.getTime()) / 60000);

        setNewEvent({
            title: event.title,
            category: event.category,
            time: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            duration: duration > 0 ? duration : 60
        });

        setEditingId(event.id);
        setShowForm(true);
    };

    const handleDeleteEvent = async (id: string) => {
        if (!agendaAvailable) return;
        if (!confirm("Excluir evento?")) return;
        const { error } = await supabase.from('user_agenda_events').delete().eq('id', id);
        if (rememberMissingRelation('user_agenda_events', error)) {
            setAgendaAvailable(false);
            setEvents([]);
            return;
        }
        setEvents(events.filter(e => e.id !== id));
    };

    // --- CALENDAR HELPERS ---
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        return Array.from({ length: days }, (_, i) => i + 1);
    };

    const changeMonth = (offset: number) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setSelectedDate(newDate);
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/20 z-[60] backdrop-blur-sm" onClick={onClose}></div>
            <div className="fixed top-0 right-0 h-full w-[400px] bg-white dark:bg-[#101622] shadow-2xl z-[70] flex flex-col animate-in slide-in-from-right duration-300 border-l border-gray-100 dark:border-gray-800">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-black text-gray-800 dark:text-gray-100">Minha Agenda</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500 font-medium">Olá, {user?.user_metadata?.full_name?.split(' ')[0]}</p>
                            <span className="text-gray-300">|</span>
                            <button
                                onClick={() => {
                                    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                                    context.resume();
                                    const osc = context.createOscillator();
                                    const g = context.createGain();
                                    osc.frequency.value = 880;
                                    g.gain.value = 0.1;
                                    osc.connect(g);
                                    g.connect(context.destination);
                                    osc.start();
                                    osc.stop(context.currentTime + 0.2);
                                    alert("Som desbloqueado!");
                                }}
                                className="text-[10px] font-bold text-purple-500 hover:text-purple-700 underline"
                            >
                                Testar Som
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('test-agenda-notification'));
                                    alert("Simulação enviada!");
                                }}
                                className="text-[10px] font-bold text-blue-500 hover:text-blue-700 underline"
                            >
                                Simular Alerta
                            </button>
                        </div>
                        {!agendaAvailable && (
                            <p className="mt-3 text-[11px] font-bold text-amber-600">
                                Agenda indisponivel neste banco atual. O restante do sistema continua funcionando normalmente.
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <span className="material-symbols-outlined text-gray-500">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

                    {/* Calendar Widget */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded-full"><span className="material-symbols-outlined text-sm">chevron_left</span></button>
                            <span className="font-bold text-sm text-gray-700 dark:text-gray-200 capitalize">
                                {selectedDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded-full"><span className="material-symbols-outlined text-sm">chevron_right</span></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
                            <div>DOM</div><div>SEG</div><div>TER</div><div>QUA</div><div>QUI</div><div>SEX</div><div>SAB</div>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {/* Empty slots for start of month */}
                            {Array.from({ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay() }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square"></div>
                            ))}
                            {getDaysInMonth(selectedDate).map(day => {
                                const isSelected = day === selectedDate.getDate();
                                const isToday = day === new Date().getDate() && selectedDate.getMonth() === new Date().getMonth() && selectedDate.getFullYear() === new Date().getFullYear();
                                return (
                                    <button
                                        key={day}
                                        onClick={() => {
                                            const d = new Date(selectedDate);
                                            d.setDate(day);
                                            setSelectedDate(d);
                                        }}
                                        className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all
                                    ${isSelected ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-500/30' :
                                                isToday ? 'bg-purple-100 text-purple-700 font-bold border border-purple-200' :
                                                    'hover:bg-gray-100 text-gray-600 dark:text-gray-300'}
                                `}
                                    >
                                        {day}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Event List */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">
                                <span className="material-symbols-outlined text-purple-500 text-lg">event</span>
                                {selectedDate.toLocaleDateString()}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowForm(!showForm);
                                    setEditingId(null);
                                    setNewEvent({ title: '', category: 'meeting', time: '09:00', duration: 60 });
                                }}
                                disabled={!agendaAvailable}
                                className="text-[10px] font-black uppercase bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg border border-purple-100 hover:bg-purple-100 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="material-symbols-outlined text-sm">add</span> Novo
                            </button>
                        </div>

                        {/* New Event Form */}
                        {showForm && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 animate-in fade-in zoom-in-95">
                                <input
                                    autoFocus
                                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm font-bold mb-2 outline-none focus:border-purple-500"
                                    placeholder="Título do compromisso..."
                                    value={newEvent.title}
                                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input
                                        type="time"
                                        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm outline-none focus:border-purple-500"
                                        value={newEvent.time}
                                        onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                                    />
                                    <select
                                        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm outline-none focus:border-purple-500"
                                        value={newEvent.category}
                                        onChange={e => setNewEvent({ ...newEvent, category: e.target.value as any })}
                                    >
                                        <option value="meeting">Reunião</option>
                                        <option value="site_visit">Visita</option>
                                        <option value="deadline">Prazo</option>
                                        <option value="personal">Pessoal</option>
                                    </select>
                                </div>
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-200 rounded-lg">Cancelar</button>
                                    <button onClick={handleSaveEvent} className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 shadow-sm">
                                        {editingId ? 'Atualizar' : 'Salvar'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {loading ? <div className="text-center py-8 text-gray-400 text-xs">Carregando...</div> : (
                            <div className="space-y-3">
                                {!agendaAvailable ? (
                                    <div className="text-center py-10 border-2 border-dashed border-amber-200 rounded-xl bg-amber-50/50">
                                        <span className="material-symbols-outlined text-amber-400 text-3xl mb-2">event_busy</span>
                                        <p className="text-amber-700 text-xs font-bold">Tabela user_agenda_events nao encontrada neste Supabase.</p>
                                    </div>
                                ) : events.length === 0 ? (
                                    <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-xl">
                                        <span className="material-symbols-outlined text-gray-300 text-3xl mb-2">event_busy</span>
                                        <p className="text-gray-400 text-xs">Sem compromissos hoje.</p>
                                    </div>
                                ) : (
                                    events.map(event => {
                                        const style = CATEGORY_STYLES[event.category] || CATEGORY_STYLES.meeting;
                                        const timeStr = new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        return (
                                            <div key={event.id} className="group relative bg-white dark:bg-gray-800 p-4 rounded-xl border-l-[3px] border-l-purple-500 shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide flex items-center gap-1 ${style.bg} ${style.text}`}>
                                                        <span className="material-symbols-outlined text-[10px]">{style.icon}</span>
                                                        {style.label}
                                                    </span>
                                                    <span className="text-xs font-mono font-bold text-gray-500">{timeStr}</span>
                                                </div>
                                                <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm">{event.title}</h4>
                                                <button onClick={() => handleEditEvent(event)} className="absolute top-2 right-8 p-1.5 text-blue-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all" title="Editar">
                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                </button>
                                                <button onClick={() => handleDeleteEvent(event.id)} className="absolute top-2 right-2 p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all" title="Excluir">
                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                </button>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

// --- COMPONENT: Global Notification Logic ---
export const AgendaNotifier = () => {
    const { user } = useAuth();
    const [activeToast, setActiveToast] = useState<any>(null);
    const soundIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [agendaAvailable, setAgendaAvailable] = useState(() => !isRelationUnavailable('user_agenda_events'));

    const playNotificationSound = () => {
        const playBip = () => {
            try {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                context.resume().then(() => {
                    const oscillator = context.createOscillator();
                    const gain = context.createGain();
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(880, context.currentTime);
                    gain.gain.setValueAtTime(0.1, context.currentTime);
                    oscillator.connect(gain);
                    gain.connect(context.destination);
                    oscillator.start();
                    oscillator.stop(context.currentTime + 0.3);
                });
            } catch (e) { }
        };

        if (soundIntervalRef.current) clearInterval(soundIntervalRef.current);
        playBip();
        soundIntervalRef.current = setInterval(playBip, 2000);
    };

    const stopNotificationSound = () => {
        if (soundIntervalRef.current) {
            clearInterval(soundIntervalRef.current);
            soundIntervalRef.current = null;
        }
    };

    useEffect(() => {
        if (!user || !agendaAvailable) return;

        const checkReminders = async () => {
            if (!user?.id) return;
            const now = new Date();

            const { data: allEvents, error } = await supabase
                .from('user_agenda_events')
                .select('*')
                .eq('user_id', user.id);

            if (rememberMissingRelation('user_agenda_events', error)) {
                setAgendaAvailable(false);
                return;
            }

            if (error || !allEvents) return;

            const soonEvents = allEvents.filter(event => {
                if (event.reminder_sent === true) return false;
                const startTime = new Date(event.start_time).getTime();
                const nowTime = now.getTime();
                const diffMinutes = (startTime - nowTime) / 60000;

                // Trigger only if the event is happening now (2 min before to 5 min after start)
                return diffMinutes >= -5 && diffMinutes <= 2;
            });

            if (soonEvents.length > 0) {
                soonEvents.forEach(async (event) => {
                    playNotificationSound();
                    setActiveToast(event);
                    if (Notification.permission === 'granted') {
                        new Notification(`🔔 SIGOP: ${event.title}`, {
                            body: `Inicia em breve (${new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
                        });
                    }
                    await supabase.from('user_agenda_events').update({ reminder_sent: true }).eq('id', event.id);
                });
            }
        };

        const handleTest = () => {
            playNotificationSound();
            setActiveToast({
                title: "Teste de Notificação SIGOP",
                start_time: new Date().toISOString()
            });
        };
        window.addEventListener('test-agenda-notification', handleTest);
        const interval = setInterval(checkReminders, 10000);
        checkReminders();

        return () => {
            clearInterval(interval);
            window.removeEventListener('test-agenda-notification', handleTest);
            stopNotificationSound();
        };
    }, [user, agendaAvailable]);

    const handleDismiss = () => {
        setActiveToast(null);
        stopNotificationSound();
    };

    if (!activeToast) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 border-2 border-purple-500 shadow-2xl rounded-2xl p-5 w-80 flex flex-col gap-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-purple-500 animate-[shimmer_2s_infinite]"></div>
                <div className="flex justify-between items-start">
                    <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 p-2 rounded-xl">
                        <span className="material-symbols-outlined text-2xl">notifications_active</span>
                    </div>
                    <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
                <div>
                    <h4 className="font-black text-gray-800 dark:text-gray-100 text-sm leading-tight">Lembrete de Compromisso</h4>
                    <p className="text-purple-600 font-bold text-lg mt-1">{activeToast.title}</p>
                    <p className="text-xs text-gray-500 font-medium mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">schedule</span>
                        Inicia às {new Date(activeToast.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <button
                    onClick={handleDismiss}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-500/20 transition-all"
                >
                    Entendido
                </button>
            </div>
        </div>
    );
};
