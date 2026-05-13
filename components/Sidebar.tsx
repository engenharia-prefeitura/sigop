
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isNoRowsError } from '../lib/supabaseCompat';

import { useAuth } from './AuthContext';

interface SidebarProps {
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const { user } = useAuth(); // Global User

  React.useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        try {
          const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
          if (error && !isNoRowsError(error)) throw error;
          setIsAdmin(!!data?.is_admin);
        } catch (e) { /* ignore */ }
      }
    };
    checkAdmin();
  }, [user]);

  const menuItems = [
    { path: '/', icon: 'dashboard', label: 'Dashboard' },
    { path: '/documents', icon: 'description', label: 'Documentos Técnicos' },
    { path: '/field-surveys', icon: 'offline_bolt', label: 'Campo Offline' },
    { path: '/notifications', icon: 'notifications_active', label: 'Notificações' },
    {
      path: '/projects', icon: 'engineering', label: 'Obras',
      children: [
        { path: '/projects', label: 'Lista de Obras', exact: true },
        { path: '/projects?view=map', label: 'Mapa Geral' }
      ]
    },
    { path: '/designs', icon: 'draw', label: 'Banco de Projetos' },
    { path: '/users', icon: 'group', label: 'Usuários', adminOnly: true },
  ];

  const location = useLocation();
  const isFieldSurveysPage = location.pathname === '/field-surveys';
  const isFloatingCollapsed = isFieldSurveysPage && collapsed;

  const visibleItems = menuItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside
      className={`flex-none flex flex-col text-white h-full z-30 transition-all duration-300 print:hidden ${
        isFloatingCollapsed
          ? 'w-0 border-r-0 bg-transparent dark:bg-transparent lg:w-20 lg:border-r lg:border-slate-700/50 lg:bg-[#1e293b] lg:dark:bg-[#101622]'
          : `${collapsed ? 'w-20' : 'w-64'} border-r border-slate-700/50 bg-[#1e293b] dark:bg-[#101622]`
      }`}
    >
      <div className={`${isFloatingCollapsed ? 'hidden lg:flex' : 'flex'} items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-3 px-4 py-4 border-b border-slate-700/50 relative group`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''} overflow-hidden`}>
          <div className="bg-primary rounded-lg size-10 flex-none flex items-center justify-center text-white">
            <span className="material-symbols-outlined !text-3xl">architecture</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 transition-opacity duration-200">
              <h1 className="text-white text-lg font-bold leading-none tracking-wide truncate">SIGOP</h1>
              <p className="text-slate-400 text-xs font-normal mt-1 uppercase tracking-tighter truncate">Obras Públicas</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`absolute ${collapsed ? 'bottom-2 -right-3 size-6' : 'right-3 size-8'} bg-slate-800 border border-slate-600 rounded-full shadow-md z-40 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 transition-all`}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          <span className="material-symbols-outlined text-sm">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>

      {isFloatingCollapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="fixed left-1 top-10 z-50 flex size-9 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-100 shadow-lg shadow-slate-950/20 transition-all hover:bg-slate-700 lg:hidden"
          title="Expandir menu"
        >
          <span className="material-symbols-outlined text-lg">chevron_right</span>
        </button>
      )}

      <nav className={`${isFloatingCollapsed ? 'hidden lg:flex' : 'flex'} flex-1 flex-col gap-1 p-2 overflow-y-auto`}>
        {visibleItems.map((item) => (
          <React.Fragment key={item.path}>
            <NavLink
              to={item.path}
              end={item.children ? false : undefined}
              title={collapsed ? item.label : ''}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${isActive && !item.children
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : (location.pathname.startsWith(item.path) && item.children ? 'bg-primary/10 text-primary' : 'text-slate-300 hover:bg-white/5 hover:text-white')
                } ${collapsed ? 'justify-center' : ''}`
              }
            >
              <span className="material-symbols-outlined text-2xl">{item.icon}</span>
              {!collapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap overflow-hidden">{item.label}</p>}
            </NavLink>

            {!collapsed && item.children && location.pathname.startsWith(item.path) && (
              <div className="ml-10 border-l mb-2 border-slate-700/50 pl-2 flex flex-col gap-1">
                {item.children.map((child) => (
                  <NavLink
                    key={child.path}
                    to={child.path}
                    end
                    className={({ isActive }) => {
                      const isMap = location.search.includes('view=map');
                      const isChildMap = child.path.includes('view=map');
                      const active = (isChildMap && isMap) || (!isChildMap && !isMap && isActive);

                      return `block px-3 py-2 text-xs rounded-md transition-colors ${active
                        ? 'text-white bg-slate-700/50 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`
                    }}
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className={`${isFloatingCollapsed ? 'hidden lg:flex' : 'flex'} p-2 mt-auto border-t border-slate-700/50 flex-col gap-1`}>
        <NavLink
          to="/settings"
          title={collapsed ? 'Configurações' : ''}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-primary/20 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
            } ${collapsed ? 'justify-center' : ''}`
          }
        >
          <span className="material-symbols-outlined text-2xl">settings</span>
          {!collapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap overflow-hidden">Configurações</p>}
        </NavLink>
        <button
          onClick={onLogout}
          title={collapsed ? 'Sair' : ''}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors w-full text-left ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="material-symbols-outlined text-2xl">logout</span>
          {!collapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap overflow-hidden">Sair</p>}
        </button>
      </div>
    </aside >
  );
};

export default Sidebar;
