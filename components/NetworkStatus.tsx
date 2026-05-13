import React, { useState, useEffect } from 'react';

type ConnectionStatus = 'online' | 'slow' | 'offline';

const NetworkStatus: React.FC = () => {
    const [status, setStatus] = useState<ConnectionStatus>(navigator.onLine ? 'online' : 'offline');
    const [latency, setLatency] = useState<number>(0);
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            checkConnection();
        };
        const handleOffline = () => setStatus('offline');

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial check
        checkConnection();

        // Periodic check every 10 seconds
        const interval = setInterval(checkConnection, 10000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    const checkConnection = async () => {
        if (!navigator.onLine) {
            setStatus('offline');
            return;
        }

        setIsChecking(true);
        const start = Date.now();

        try {
            // Usamos uma imagem para evitar problemas de CORS e testar a internet real
            // O favicon do Google é altamente confiável e rápido
            const img = new Image();

            const checkPromise = new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject();
                // Timeout de 5s para considerar falha/lento
                setTimeout(() => reject(new Error("Timeout")), 5000);
            });

            img.src = `https://www.google.com/favicon.ico?_=${start}`; // Cache busting

            await checkPromise;

            const end = Date.now();
            const duration = end - start;
            setLatency(duration);

            if (duration > 2000) {
                setStatus('slow');
            } else {
                setStatus('online');
            }
        } catch (e) {
            // Se falhar o ping externo, mas navigator diz online, pode ser firewall ou internet realmente caiu
            // Vamos tentar um fallback para o servidor local para diferenciar "sem internet" de "servidor caiu"
            // Mas aqui o foco é "internet ruim", então assumimos offline/instavel
            setStatus('offline');
        } finally {
            setIsChecking(false);
        }
    };

    // Cores e Icones baseados no estado
    const getStatusColor = () => {
        switch (status) {
            case 'online': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'slow': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'offline': return 'bg-red-100 text-red-800 border-red-200';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'online': return `Internet Boa (${latency}ms)`;
            case 'slow': return `Internet Lenta (${latency}ms)`;
            case 'offline': return 'Sem Internet';
        }
    };

    const getIndicatorColor = () => {
        switch (status) {
            case 'online': return 'bg-emerald-500';
            case 'slow': return 'bg-yellow-500';
            case 'offline': return 'bg-red-500';
        }
    };

    return (
        <div
            className={`fixed bottom-4 right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg border text-xs font-semibold transition-all duration-300 ${getStatusColor()} ${status === 'offline' ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
            title="Status da Conexão com a Internet"
        >
            <span className="relative flex h-2.5 w-2.5">
                {status === 'online' && (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${getIndicatorColor()} opacity-75`}></span>
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${getIndicatorColor()}`}></span>
            </span>
            <span>{getStatusText()}</span>
        </div>
    );
};

export default NetworkStatus;
