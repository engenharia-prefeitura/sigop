
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isRelationUnavailable, rememberMissingRelation } from '../lib/supabaseCompat';

import { AgendaDrawer } from './Agenda';
import { useAuth } from './AuthContext';
import NetworkStatus from './NetworkStatus';

const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth(); // Use Global Context
  const [isAgendaOpen, setIsAgendaOpen] = useState(false);

  // Removed search logic


  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Visão Geral do Dashboard';
      case '/documents': return 'Documentos Técnicos';
      case '/projects': return 'Obras e Projetos';
      case '/users': return 'Gestão de Usuários';
      case '/settings': return 'Configurações do Sistema';
      case '/notifications': return 'Fiscalização';
      default:
        if (location.pathname.startsWith('/editor')) return 'Editor de Documento';
        return 'SIGOP';
    }
  };

  const userName = user?.user_metadata?.full_name || 'Usuário';
  const userRole = user?.user_metadata?.role_title || 'Engenheiro(a)';
  const userAvatar = user?.user_metadata?.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random';


  // --- NEXT EVENT TICKER ---
  const [nextEvent, setNextEvent] = useState<any>(null);
  const [agendaAvailable, setAgendaAvailable] = useState(() => !isRelationUnavailable('user_agenda_events'));

  useEffect(() => {
    if (!user || !agendaAvailable) return;

    const fetchNextEvent = async () => {
      const now = new Date();
      const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('user_agenda_events')
        .select('*')
        .eq('user_id', user.id)
        .gt('start_time', now.toISOString())
        .lt('start_time', sixHoursLater.toISOString())
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (rememberMissingRelation('user_agenda_events', error)) {
        setAgendaAvailable(false);
        setNextEvent(null);
        return;
      }

      setNextEvent(data);
    };

    fetchNextEvent();
    const interval = setInterval(fetchNextEvent, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [user, agendaAvailable]);

  const getEventColor = (category: string) => {
    switch (category) {
      case 'deadline': return 'bg-red-100 text-red-700 border-red-200';
      case 'site_visit': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'personal': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-purple-100 text-purple-700 border-purple-200';
    }
  };

  return (
    <header className="flex h-20 items-center justify-between whitespace-nowrap border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#101622] px-4 sm:px-8 sticky top-0 z-20 shrink-0 shadow-sm print:hidden">
      <div className="flex items-center gap-4">
        <h2 className="text-[#111318] dark:text-white text-xl font-bold leading-tight">{getPageTitle()}</h2>
      </div>

      <div className="flex flex-1 justify-end gap-6 items-center">

        {/* Next Event Ticker */}
        {nextEvent && (
          <div
            onClick={() => setIsAgendaOpen(true)}
            className={`hidden md:flex items-center gap-3 px-4 py-1.5 rounded-full border cursor-pointer hover:shadow-md transition-all max-w-[400px] overflow-hidden group ${getEventColor(nextEvent.category)}`}
            title={`Clique para ver detalhes: ${nextEvent.title}`}
          >
            <div className="flex flex-col items-end leading-none border-r border-current/20 pr-3 mr-1">
              <span className="text-[10px] font-black uppercase opacity-70">Próximo</span>
              <span className="text-xs font-bold">{new Date(nextEvent.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className="flex-1 overflow-hidden relative h-5 w-48">
              <div className={`absolute whitespace-nowrap ${nextEvent.title.length > 15 ? 'animate-marquee' : ''}`}>
                <span className="text-sm font-bold mr-12">{nextEvent.title}</span>
                {nextEvent.title.length > 15 && <span className="text-sm font-bold mr-12">{nextEvent.title}</span>}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsAgendaOpen(true)}
            className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/5 transition-all outline-none rounded-l-xl py-2"
            title="Minha Agenda"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-[#111318] dark:text-white leading-none">{userName}</p>
              <p className="text-[10px] text-[#616f89] uppercase font-bold tracking-wider mt-1">{userRole}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 ring-2 ring-white dark:ring-[#101622] shadow-sm relative group"
                style={{ backgroundImage: `url("${userAvatar}")` }}
              >
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="material-symbols-outlined text-white text-xs">calendar_month</span>
                </div>
              </div>
              <NetworkStatus />
            </div>
          </button>
        </div>
      </div>
      <AgendaDrawer isOpen={isAgendaOpen} onClose={() => setIsAgendaOpen(false)} />
      <style>{`
        @keyframes marquee {
          0%, 25% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: inline-block;
          animation: marquee 12s linear infinite;
        }
        .group:hover .animate-marquee {
          animation-play-state: paused;
        }
      `}</style>
    </header>
  );
};

export default Header;
