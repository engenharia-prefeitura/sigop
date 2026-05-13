import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.from('app_settings').select('*').maybeSingle();
      if (data) setSettings(data);
    } catch (e) {
      console.warn('Erro ao carregar configuracoes (usando padrao):', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    console.log('[Login] Tentando login para:', email);

    try {
      console.log('[Login] Iniciando autenticacao oficial...');
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('[Login] Supabase Auth Error:', error);
        const msg = error.message;
        if (msg.includes('Failed to fetch')) {
          setError('Erro de conexao: o navegador nao conseguiu contatar o servidor. Verifique se extensoes de bloqueio estao ativas.');
        } else {
          setError(msg === 'Invalid login credentials' ? 'Credenciais invalidas.' : msg);
        }
        setIsLoading(false);
      } else {
        console.log('[Login] Sucesso! Verificando perfil...');
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('is_active')
              .eq('id', user.id)
              .maybeSingle();

            if (profile && profile.is_active === false) {
              await supabase.auth.signOut();
              setError('Conta desativada. Contate o administrador.');
              setIsLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn('[Login] Erro ao verificar status:', err);
        }
      }
    } catch (uncaughtErr) {
      console.error('[Login] UNCAUGHT EXCEPTION:', uncaughtErr);
      setError('Erro interno inesperado.');
      setIsLoading(false);
    }
  };

  const logoUrl = settings?.company_logo_url;
  const companyName = settings?.company_name || 'SIGOP';
  const headerText = settings?.header_text || 'Sistema de Gerenciamento de Obras Publicas Municipais';

  return (
    <div className="min-h-screen w-full relative flex flex-col items-center justify-center overflow-hidden bg-background-light dark:bg-background-dark">
      <div className="absolute inset-0 z-0 bg-engineering-grid opacity-60 pointer-events-none"></div>

      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-[440px] px-4 z-10 animate-in fade-in zoom-in duration-500">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="px-8 pt-12 pb-6 flex flex-col items-center text-center">
            {logoUrl ? (
              <img src={logoUrl} className="h-20 w-auto object-contain mb-6" alt="Logo" />
            ) : (
              <div className="size-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary shadow-inner">
                <span className="material-symbols-outlined !text-4xl">architecture</span>
              </div>
            )}
            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white mb-2 uppercase leading-tight">
              {companyName}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium leading-relaxed max-w-[280px]">
              {headerText}
            </p>
          </div>

          <div className="px-8 pb-12 w-full">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
                  {error}
                </div>
              )}
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 ml-1">E-mail</span>
                <div className="relative group">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[20px]">mail</span>
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white h-13 pl-12 pr-4 placeholder:text-gray-400 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-base outline-none"
                    placeholder="seu@email.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </label>

              <label className="flex flex-col gap-2">
                <div className="flex justify-between items-center ml-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Senha</span>
                </div>
                <div className="relative flex w-full group">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[20px]">lock</span>
                  </span>
                  <input
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white h-13 pl-12 pr-12 placeholder:text-gray-400 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-base outline-none"
                    placeholder="Sua senha secreta"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </label>

              <button
                disabled={isLoading}
                type="submit"
                className="flex w-full items-center justify-center rounded-xl h-14 px-6 bg-primary hover:bg-primary-hover text-white text-lg font-extrabold tracking-wide shadow-xl shadow-primary/30 transition-all active:scale-[0.98] mt-2 group disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="size-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Acessar Painel</span>
                    <span className="material-symbols-outlined ml-2 text-[22px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="h-1.5 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60"></div>
        </div>
      </div>
    </div>
  );
};

export default Login;
