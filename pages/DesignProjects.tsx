import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

const DesignProjects = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    // Data
    const [projects, setProjects] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [boardTab, setBoardTab] = useState<'project' | 'work'>('project');

    // Ordering Mode
    const [isOrdering, setIsOrdering] = useState(false);
    const [nextOrderVal, setNextOrderVal] = useState(1);

    // New Project Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newProj, setNewProj] = useState({
        title: '',
        requester: 'Prefeito',
        customRequester: '',
        priority: 'normal',
        deadline: '',
        description: '',
        execution_order: 0
    });

    // Detail/Edit Modal
    const [selectedProject, setSelectedProject] = useState<any | null>(null);
    const [files, setFiles] = useState<any[]>([]);
    const [deliveries, setDeliveries] = useState<any[]>([]);

    // Upload State
    const [uploadQueue, setUploadQueue] = useState<{ name: string, status: 'pending' | 'uploading' | 'done' | 'error' }[]>([]);
    const [pdfViewer, setPdfViewer] = useState<{ title: string, src: string } | null>(null);
    const [openFileGroups, setOpenFileGroups] = useState<Record<string, boolean>>({});
    const [pauseModal, setPauseModal] = useState<{ status: string, previousStatus: string, reason: string } | null>(null);

    // Delete Confirmation
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        fetchProjects();
    }, []);

    const projectFileListColumns = 'id, design_project_id, title, file_url, uploaded_at';
    const mainStatusFlow = ['demanded', 'in_progress', 'under_review', 'tendered', 'in_construction', 'completed'];
    const activeOrderStatuses = ['demanded', 'in_progress', 'under_review', 'tendered', 'in_construction'];
    const pauseableStatuses = ['in_progress', 'under_review', 'tendered', 'in_construction'];
    const boardTabs = [
        { key: 'project', label: 'Projeto', statuses: ['demanded', 'in_progress', 'completed'] },
        { key: 'work', label: 'Obra / Licitacao', statuses: ['under_review', 'tendered', 'in_construction', 'paused'] }
    ];
    const statusMeta: Record<string, any> = {
        demanded: { label: 'Novas Demandas', shortLabel: 'Demanda', color: 'text-gray-500', badge: 'bg-gray-100 text-gray-700 border-gray-200', bar: 'bg-gray-400', icon: 'inbox' },
        in_progress: { label: 'Em Elaboracao', shortLabel: 'Elaboracao', color: 'text-blue-500', badge: 'bg-blue-100 text-blue-700 border-blue-200', bar: 'bg-blue-500', icon: 'edit_document' },
        under_review: { label: 'Em Analise / Licitacao', shortLabel: 'Analise', color: 'text-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', bar: 'bg-amber-500', icon: 'fact_check' },
        tendered: { label: 'Licitado', shortLabel: 'Licitado', color: 'text-indigo-500', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', bar: 'bg-indigo-500', icon: 'gavel' },
        in_construction: { label: 'Em Obra', shortLabel: 'Obra', color: 'text-green-500', badge: 'bg-green-100 text-green-700 border-green-200', bar: 'bg-green-500', icon: 'construction' },
        paused: { label: 'Paralisado', shortLabel: 'Paralisado', color: 'text-red-500', badge: 'bg-red-100 text-red-700 border-red-200', bar: 'bg-red-500', icon: 'pause_circle' },
        completed: { label: 'Concluido', shortLabel: 'Concluido', color: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', icon: 'task_alt' },
        delivered: { label: 'Concluido', shortLabel: 'Concluido', color: 'text-emerald-500', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', icon: 'task_alt' }
    };
    const fileGroupConfigs = [
        { key: 'documents', label: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'odt'], icon: 'description', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
        { key: 'images', label: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'], icon: 'image', color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
        { key: 'cad', label: 'CAD / Projetos', extensions: ['dwg', 'dxf', 'rvt', 'ifc'], icon: 'architecture', color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
        { key: 'spreadsheets', label: 'Planilhas', extensions: ['xls', 'xlsx', 'csv', 'ods'], icon: 'table_chart', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
        { key: 'others', label: 'Outros', extensions: [], icon: 'folder_zip', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-100' }
    ];

    const normalizeProjectStatus = (status: string) => status === 'delivered' ? 'completed' : status;

    const getStatusInfo = (status: string) => statusMeta[normalizeProjectStatus(status)] || statusMeta.demanded;

    const getFileExtension = (title: string) => {
        const cleanTitle = String(title || '').split('?')[0];
        const parts = cleanTitle.split('.');
        return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
    };

    const getFileGroupConfig = (file: any) => {
        const ext = getFileExtension(file?.title || file?.file_url || '');
        return fileGroupConfigs.find(group => group.extensions.includes(ext)) || fileGroupConfigs[fileGroupConfigs.length - 1];
    };

    const getGroupedFiles = () => fileGroupConfigs
        .map(group => ({
            ...group,
            files: files.filter(file => getFileGroupConfig(file).key === group.key)
        }))
        .filter(group => group.files.length > 0);

    const getDefaultOpenGroupKey = () => {
        const groups = getGroupedFiles();
        if (!groups.length) return '';
        return groups.reduce((largest, group) => group.files.length > largest.files.length ? group : largest, groups[0]).key;
    };

    const isPdfFile = (file: any) => {
        const title = String(file?.title || '').toLowerCase();
        const fileUrl = String(file?.file_url || '').toLowerCase();
        const fileContent = String(file?.file_content || '').toLowerCase();

        return title.endsWith('.pdf') || fileUrl.includes('.pdf') || fileContent.startsWith('data:application/pdf');
    };

    const fetchProjectFiles = async (projectId: string) => {
        const { data, error } = await supabase
            .from('design_project_files')
            .select(projectFileListColumns)
            .eq('design_project_id', projectId)
            .order('uploaded_at', { ascending: false });

        if (error) {
            console.error("Erro ao carregar arquivos do projeto:", error);
            alert("Erro ao carregar a lista de arquivos. Tente abrir o projeto novamente.");
            return [];
        }

        return data || [];
    };

    const fetchProjectFileContent = async (fileId: string) => {
        const { data, error } = await supabase
            .from('design_project_files')
            .select('title, file_url, file_content')
            .eq('id', fileId)
            .single();

        if (error) {
            console.error("Erro ao carregar arquivo:", error);
            alert("Nao foi possivel carregar este arquivo.");
            return null;
        }

        return data;
    };

    const fetchProjects = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('design_projects').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error(error);
        } else {
            setProjects(data || []);
            // Calculate next order based on max existing
            const maxOrder = data?.reduce((max, p) => (p.execution_order || 0) > max ? p.execution_order : max, 0) || 0;
            setNextOrderVal(maxOrder + 1);
        }
        setLoading(false);
    };

    const handleCreate = async () => {
        if (!newProj.title) return alert("Título é obrigatório");

        const finalRequester = newProj.requester === 'Outros' ? newProj.customRequester : newProj.requester;
        if (!finalRequester) return alert("Informe o solicitante");

        const payload = {
            title: newProj.title,
            requester: finalRequester,
            priority: newProj.priority,
            deadline: newProj.deadline || null,
            description: newProj.description,
            status: 'demanded',
            execution_order: newProj.execution_order || 0
        };

        const { error } = await supabase.from('design_projects').insert([payload]);
        if (error) {
            alert("Erro ao criar: " + error.message);
        } else {
            fetchProjects();
        }
        setIsModalOpen(false);
        setNewProj({ title: '', requester: 'Prefeito', customRequester: '', priority: 'normal', deadline: '', description: '', execution_order: 0 });
    };

    const handleCardClick = async (project: any) => {
        if (isOrdering) {
            // UPDATE ORDER MODE
            const newOrder = nextOrderVal;

            // Optimistic update
            const updatedProjects = projects.map(p => p.id === project.id ? { ...p, execution_order: newOrder } : p);
            setProjects(updatedProjects);
            setNextOrderVal(newOrder + 1);

            const { error } = await supabase.from('design_projects').update({ execution_order: newOrder }).eq('id', project.id);
            if (error) {
                console.error("Failed to update order", error);
                // Revert if needed (omitted for simplicity, assume success or refresh)
            }
        } else {
            // OPEN DETAIL MODE
            handleOpenDetail(project);
        }
    };

    const handleResetOrdering = async () => {
        if (!window.confirm("Isso irá RESETAR a ordem de execução de TODOS os projetos ativos (Novas Demandas e Em Elaboração) para 0. Deseja continuar?")) return;

        const { error } = await supabase.from('design_projects')
            .update({ execution_order: 0 })
            .in('status', activeOrderStatuses);

        if (error) alert("Erro ao resetar: " + error.message);
        else {
            setNextOrderVal(1);
            fetchProjects();
        }
    };

    const handleOpenDetail = async (project: any) => {
        setSelectedProject(project);
        setUploadQueue([]);
        setOpenFileGroups({});
        // Fetch files and deliveries
        const projectFiles = await fetchProjectFiles(project.id);
        const dReq = await supabase.from('design_project_deliveries').select('*').eq('design_project_id', project.id).order('delivered_at', { ascending: false });

        setFiles(projectFiles);
        setDeliveries(dReq.data || []);
    };

    const initiateDelete = () => {
        setIsDeleteModalOpen(true);
        setDeleteConfirmationText('');
        setPassword('');
    };

    const confirmDelete = async () => {
        if (!selectedProject) return;

        if (!password) {
            alert('Por favor, digite sua senha.');
            return;
        }

        try {
            // Verify password
            const { data: { user: signedUser }, error: authError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: password
            });

            if (authError || !signedUser) throw new Error('Senha incorreta');

            // Proceed with delete
            const { error } = await supabase.from('design_projects').delete().eq('id', selectedProject.id);
            if (error) throw error;

            setProjects(projects.filter(p => p.id !== selectedProject.id));
            setSelectedProject(null);
            setIsDeleteModalOpen(false);
            alert("Projeto excluído com sucesso.");

        } catch (err: any) {
            alert(err.message || "Erro ao excluir projeto.");
        }
    };

    const legacyHandleUpdateStatus = async (status: string) => {
        if (!selectedProject) return;

        // Prevent invalid transitions (Basic Enforcement)
        const current = selectedProject.status;
        let allowed = false;

        if (current === 'demanded' && status === 'in_progress') allowed = true;
        else if (current === 'in_progress' && (status === 'completed' || status === 'demanded')) allowed = true;
        else if (current === 'completed' && (status === 'delivered' || status === 'in_progress')) allowed = true;
        else if (current === 'delivered' && status === 'completed') allowed = true;

        // Allow same status (no-op)
        if (current === status) allowed = true;

        if (!allowed) {
            alert("Mudança de status não permitida para este fluxo.");
            return;
        }

        const updatePayload: any = { status };
        if (status === 'completed' && !selectedProject.completed_at) {
            updatePayload.completed_at = new Date().toISOString();
        }

        const { error } = await supabase.from('design_projects').update(updatePayload).eq('id', selectedProject.id);
        if (error) alert(error.message);
        else {
            setSelectedProject({ ...selectedProject, ...updatePayload });
            fetchProjects();
        }
    };

    const updateProjectStatus = async (payload: any, fallbackPayload?: any) => {
        if (!selectedProject) return false;

        const { error } = await supabase.from('design_projects').update(payload).eq('id', selectedProject.id);
        if (error && fallbackPayload) {
            console.warn("Atualizacao com campos opcionais falhou. Tentando fallback.", error);
            const fallback = await supabase.from('design_projects').update(fallbackPayload).eq('id', selectedProject.id);
            if (fallback.error) {
                alert(fallback.error.message);
                return false;
            }
            setSelectedProject({ ...selectedProject, ...fallbackPayload });
            setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, ...fallbackPayload } : p));
            fetchProjects();
            return true;
        }

        if (error) {
            alert(error.message);
            return false;
        }

        setSelectedProject({ ...selectedProject, ...payload });
        setProjects(projects.map(p => p.id === selectedProject.id ? { ...p, ...payload } : p));
        fetchProjects();
        return true;
    };

    const handleUpdateStatus = async (status: string) => {
        if (!selectedProject) return;

        const current = normalizeProjectStatus(selectedProject.status);
        const target = normalizeProjectStatus(status);

        if (target === current) return;

        if (target === 'paused') {
            if (!pauseableStatuses.includes(current)) {
                alert("Somente projetos ativos podem ser paralisados.");
                return;
            }
            setPauseModal({ status: 'paused', previousStatus: current, reason: selectedProject.pause_reason || '' });
            return;
        }

        let allowed = false;
        const currentIndex = mainStatusFlow.indexOf(current);
        const targetIndex = mainStatusFlow.indexOf(target);

        if (current === 'paused') {
            const resumeStatus = selectedProject.previous_status || 'in_progress';
            allowed = target === resumeStatus || target === 'in_progress';
        } else if (currentIndex >= 0 && targetIndex >= 0) {
            allowed = targetIndex === currentIndex + 1 || targetIndex === currentIndex - 1;
        }

        if (!allowed) {
            alert("Mudanca de status nao permitida para este fluxo.");
            return;
        }

        const updatePayload: any = { status: target };
        if (target === 'completed' && !selectedProject.completed_at) {
            updatePayload.completed_at = new Date().toISOString();
        }
        if (current === 'paused') {
            updatePayload.previous_status = null;
            updatePayload.pause_reason = null;
        }

        await updateProjectStatus(updatePayload, { status: target, ...(updatePayload.completed_at ? { completed_at: updatePayload.completed_at } : {}) });
    };

    const confirmPauseStatus = async () => {
        if (!selectedProject || !pauseModal) return;
        const reason = pauseModal.reason.trim();

        if (!reason) {
            alert("Informe o motivo da paralisacao.");
            return;
        }

        const pausedAt = new Date().toLocaleString();
        const fallbackDescription = `${selectedProject.description || ''}\n\n[Paralisado em ${pausedAt}] ${reason}`.trim();
        const payload = {
            status: 'paused',
            previous_status: pauseModal.previousStatus,
            pause_reason: reason
        };

        const success = await updateProjectStatus(payload, { status: 'paused', description: fallbackDescription });
        if (success) setPauseModal(null);
    };

    const handleUpdateOrder = async (order: number) => {
        if (!selectedProject) return;
        const { error } = await supabase.from('design_projects').update({ execution_order: order }).eq('id', selectedProject.id);
        if (error) alert("Erro ao atualizar ordem");
        else {
            setSelectedProject({ ...selectedProject, execution_order: order });
            fetchProjects();
        }
    }

    const handleUpdateDescription = async (newDesc: string) => {
        if (!selectedProject) return;

        // Optimistic update
        setSelectedProject({ ...selectedProject, description: newDesc });

        const { error } = await supabase.from('design_projects').update({ description: newDesc }).eq('id', selectedProject.id);
        if (error) {
            console.error(error);
            alert("Erro ao salvar descrição");
        } else {
            fetchProjects(); // Sync list
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files.length || !selectedProject) return;

        const filesToUpload = Array.from(e.target.files);
        // Initialize Queue
        const newQueue = filesToUpload.map(f => ({ name: f.name, status: 'pending' as const }));
        setUploadQueue(newQueue);

        // Process sequentially
        for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];

            // Update status to uploading
            setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));

            try {
                // Read and Upload
                const result = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (evt) => resolve(evt.target?.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const content = result as string;
                await supabase.from('design_project_files').insert([{
                    design_project_id: selectedProject.id,
                    title: file.name,
                    file_content: content
                }]);

                // Update status to done
                setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'done' } : item));

                // Refresh files list immediately to show the new file
                setFiles(await fetchProjectFiles(selectedProject.id));

            } catch (err) {
                console.error(err);
                setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'error' } : item));
            }
        }

        // Clear queue after a delay
        setTimeout(() => setUploadQueue([]), 3000);
        e.target.value = '';
    };

    const handleViewFile = async (file: any) => {
        if (!isPdfFile(file)) {
            alert("Este arquivo nao e PDF. Apenas arquivos PDF podem ser visualizados no sistema.");
            return;
        }

        const fullFile = await fetchProjectFileContent(file.id);
        if (!fullFile) return;

        if (!isPdfFile(fullFile)) {
            alert("Este arquivo nao e PDF. Apenas arquivos PDF podem ser visualizados no sistema.");
            return;
        }

        const src = fullFile.file_content || fullFile.file_url;
        if (!src) {
            alert("Nao foi encontrado conteudo para visualizar este PDF.");
            return;
        }

        setPdfViewer({ title: fullFile.title || file.title, src });
    };

    const handleDownloadFile = async (file: any) => {
        const fullFile = await fetchProjectFileContent(file.id);
        if (!fullFile) return;

        const src = fullFile.file_content || fullFile.file_url;
        if (!src) {
            alert("Nao foi encontrado conteudo para baixar este arquivo.");
            return;
        }

        const link = document.createElement('a');
        link.href = src;
        link.download = fullFile.title || file.title || 'arquivo';
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const handleDeleteFile = async (id: string) => {
        if (!window.confirm("Excluir arquivo?")) return;
        await supabase.from('design_project_files').delete().eq('id', id);
        setFiles(files.filter(f => f.id !== id));
    };

    const handleDelivery = async () => {
        if (selectedProject.status !== 'completed') {
            alert("Apenas projetos CONCLUÍDOS podem ser entregues.");
            return;
        }

        const deliveredTo = prompt("Entregue para quem? (Nome do Secretário/Prefeito)");
        if (!deliveredTo) return;

        const { error } = await supabase.from('design_project_deliveries').insert([{
            design_project_id: selectedProject.id,
            delivered_to: deliveredTo,
            observation: 'Protocolo gerado pelo sistema'
        }]);

        if (error) alert(error.message);
        else {
            // Update status to delivered automatically
            await handleUpdateStatus('delivered');

            // Refresh deliveries
            const dReq = await supabase.from('design_project_deliveries').select('*').eq('design_project_id', selectedProject.id).order('delivered_at', { ascending: false });
            setDeliveries(dReq.data || []);
            alert("Entrega registrada com sucesso!");
        }
    };

    const handleDeleteDelivery = async (id: string) => {
        if (!window.confirm("Deseja CANCELAR este registro de entrega?")) return;

        const { error } = await supabase.from('design_project_deliveries').delete().eq('id', id);
        if (error) alert(error.message);
        else {
            const dReq = await supabase.from('design_project_deliveries').select('*').eq('design_project_id', selectedProject.id).order('delivered_at', { ascending: false });
            setDeliveries(dReq.data || []);
        }
    };

    const handlePrintProtocol = (delivery: any) => {
        const win = window.open('', '_blank');
        if (!win) return;

        win.document.write(`
            <html>
                <head>
                    <title>Protocolo de Entrega - SIGOP</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; }
                        .box { border: 1px solid #000; padding: 20px; margin-bottom: 20px; }
                        h1 { text-align: center; text-transform: uppercase; font-size: 18px; margin-bottom: 5px; }
                        h2 { text-align: center; font-size: 14px; color: #555; margin-top: 0; margin-bottom: 30px; }
                        .info { margin-bottom: 15px; font-size: 14px; }
                        .sign { margin-top: 60px; border-top: 1px solid #000; width: 60%; margin-left: auto; margin-right: auto; text-align: center; padding-top: 5px; }
                    </style>
                </head>
                <body>
                    <div class="box">
                        <h1>Protocolo de Entrega de Projetos</h1>
                        <h2>SIGOP - Sistema Integrado de Gestão de Obras Públicas</h2>
                        
                        <div class="info"><strong>Projeto:</strong> ${selectedProject.title}</div>
                        <div class="info"><strong>Solicitante Original:</strong> ${selectedProject.requester}</div>
                        <div class="info"><strong>Data da Entrega:</strong> ${new Date(delivery.delivered_at).toLocaleString()}</div>
                        <div class="info"><strong>Entregue a:</strong> ${delivery.delivered_to}</div>
                        <div class="info"><strong>Observações:</strong> ${delivery.observation || '-'}</div>
                        
                        <div class="sign">
                            <strong>${delivery.delivered_to}</strong><br>
                            Recebido em
                        </div>
                    </div>
                    <div style="font-size: 10px; text-align: center; color: #999;">Gerado eletronicamente pelo SIGOP em ${new Date().toLocaleString()}</div>
                    <script>window.print();</script>
                </body>
            </html>
        `);
        win.document.close();
    };

    // --- REPORT GENERATION ---
    const generateReport = () => {
        const win = window.open('', '_blank');
        if (!win) return;

        const now = new Date();
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(now.getMonth() - 2);

        // Filter: Show all demanded/in_progress. Show completed/delivered only if recent (last 2 months)
        // Order by execution_order
        let filteredProjects = projects.filter(p => {
            if (activeOrderStatuses.includes(normalizeProjectStatus(p.status)) || normalizeProjectStatus(p.status) === 'paused') return true;
            const dateToCheck = new Date(p.created_at);
            return dateToCheck >= twoMonthsAgo;
        }).sort((a, b) => (b.execution_order || 0) - (a.execution_order || 0)); // Desc order for report? Or asc? Usually Asc for '1st, 2nd'. 
        // Let's do ASC for execution order in report so it shows priority list.
        filteredProjects.sort((a, b) => {
            // Sort by Order ASC (0 is last or first? existing code treated 0 as no order)
            // Let's say we want set orders first.
            const orderA = a.execution_order || 999999;
            const orderB = b.execution_order || 999999;
            return orderA - orderB;
        });

        const title = "Relatório Geral de Projetos (Recentes)";

        // Group by Status
        const grouped = {
            demanded: filteredProjects.filter(p => p.status === 'demanded'),
            in_progress: filteredProjects.filter(p => p.status === 'in_progress'),
            under_review: filteredProjects.filter(p => p.status === 'under_review'),
            tendered: filteredProjects.filter(p => p.status === 'tendered'),
            in_construction: filteredProjects.filter(p => p.status === 'in_construction'),
            paused: filteredProjects.filter(p => p.status === 'paused'),
            completed: filteredProjects.filter(p => normalizeProjectStatus(p.status) === 'completed'),
        };

        win.document.write(`
            <html>
                <head>
                    <title>${title}</title>
                    <style>
                        body { font-family: sans-serif; padding: 40px; }
                        h1 { text-align: center; font-size: 24px; margin-bottom: 5px; text-transform: uppercase; }
                        h2 { text-align: center; font-size: 14px; color: #555; margin-top: 0; margin-bottom: 40px; }
                        
                        .section { margin-bottom: 30px; }
                        .section-title { font-size: 16px; font-weight: bold; border-bottom: 2px solid #ddd; padding-bottom: 5px; margin-bottom: 15px; color: #333; text-transform: uppercase; }
                        
                        table { width: 100%; border-collapse: collapse; font-size: 12px; }
                        th, td { border: 1px solid #eee; padding: 8px; text-align: left; }
                        th { background-color: #f9fafb; font-weight: bold; text-transform: uppercase; }
                        
                        .status-badge { padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
                        
                        .summary { display: flex; gap: 20px; justify-content: center; margin-bottom: 40px; }
                        .summary-box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px; }
                        .summary-val { font-size: 24px; font-weight: bold; display: block; }
                        .summary-label { font-size: 10px; text-transform: uppercase; color: #777; }
                    </style>
                </head>
                <body>
                    <h1>${title}</h1>
                    <h2>SIGOP - Sistema Integrado de Gestão de Obras Públicas</h2>

                    <div class="summary">
                        <div class="summary-box">
                            <span class="summary-val">${filteredProjects.length}</span>
                            <span class="summary-label">Projetos Listados</span>
                        </div>
                         <div class="summary-box" style="border-color: #blue;">
                            <span class="summary-val">${grouped.in_progress.length}</span>
                            <span class="summary-label">Em Execução</span>
                        </div>
                    </div>

                    ${Object.entries(grouped).map(([key, list]) => list.length > 0 ? `
                        <div class="section">
                            <div class="section-title">
                                ${getStatusInfo(key).label /* key === 'demanded' ? 'Novas Demandas' :
                key === 'in_progress' ? 'Em Elaboração' :
                    key === 'completed' ? 'Concluídos' : 'Entregues'}
                                */}
                                (${list.length})
                            </div>
                            <table>
                                <thead>
                                    <tr>
                                        <th width="35%">Projeto</th>
                                        <th width="20%">Solicitante</th>
                                        <th width="10%">Prioridade</th>
                                        <th width="10%">Ordem</th>
                                        <th width="15%">Data Solicitação</th>
                                        <th width="10%">Prazo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${list.map((p: any) => `
                                        <tr>
                                            <td><strong>${p.title}</strong></td>
                                            <td>${p.requester}</td>
                                            <td>${p.priority === 'urgent' ? 'URGENTE' : p.priority === 'high' ? 'Alta' : 'Normal'}</td>
                                            <td>${p.execution_order || '-'}</td>
                                            <td>${new Date(p.created_at).toLocaleDateString()}</td>
                                            <td>${p.deadline ? new Date(p.deadline).toLocaleDateString() : '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '').join('')}

                    <div style="margin-top: 50px; font-size: 10px; text-align: center; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
                        Relatório gerado em ${new Date().toLocaleString()} • Exibindo concluídos/entregues apenas dos últimos 2 meses.
                    </div>
                    <script>window.print();</script>
                </body>
            </html>
        `);
        win.document.close();
    }

    const resetOrdering = () => {
        setIsOrdering(false);
        setNextOrderVal(1);
    }

    const legacyGetAvailableStatuses = (current: string) => {
        const options = [{ value: current, label: 'Atual' }];

        if (current === 'demanded') {
            options.push({ value: 'in_progress', label: 'Iniciar Elaboração' });
        } else if (current === 'in_progress') {
            options.push({ value: 'completed', label: 'Concluir' });
            options.push({ value: 'demanded', label: 'Voltar para Nova Demanda' });
        } else if (current === 'completed') {
            options.push({ value: 'delivered', label: 'Entregar (Finalizar)' });
            options.push({ value: 'in_progress', label: 'Retornar para Elaboração' });
        } else if (current === 'delivered') {
            options.push({ value: 'completed', label: 'Cancelar Entrega (Voltar status)' });
        }
        return options;
    };


    const getAvailableStatuses = (currentStatus: string) => {
        const current = normalizeProjectStatus(currentStatus);
        const options = [{ value: current, label: `Atual - ${getStatusInfo(current).label}` }];

        if (current === 'paused') {
            const resumeStatus = selectedProject?.previous_status || 'in_progress';
            options.push({ value: resumeStatus, label: `Retomar para ${getStatusInfo(resumeStatus).label}` });
            return options;
        }

        const currentIndex = mainStatusFlow.indexOf(current);
        const previousStatus = mainStatusFlow[currentIndex - 1];
        const nextStatus = mainStatusFlow[currentIndex + 1];

        if (nextStatus) options.push({ value: nextStatus, label: `Avancar para ${getStatusInfo(nextStatus).label}` });
        if (previousStatus) options.push({ value: previousStatus, label: `Voltar para ${getStatusInfo(previousStatus).label}` });
        if (pauseableStatuses.includes(current)) options.push({ value: 'paused', label: 'Paralisar projeto' });

        return options;
    };

    const StatusColumn = ({ title, status, color, items }: any) => {
        // Sort items: Execution Order first (ASC), then Priority
        const sortedItems = [...items].sort((a, b) => {
            // Order by Execution Order ASC (so 1 is top, 2 is next)
            // But we want 0 (undefined) to be at the bottom?
            const orderA = a.execution_order && a.execution_order > 0 ? a.execution_order : 999999;
            const orderB = b.execution_order && b.execution_order > 0 ? b.execution_order : 999999;

            if (orderA !== orderB) return orderA - orderB;

            // Then Priority
            const pWeight = (p: string) => p === 'urgent' ? 3 : p === 'high' ? 2 : 1;
            return pWeight(b.priority) - pWeight(a.priority);
        });

        // Filter old completed/delivered
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(new Date().getMonth() - 2);

        const displayedItems = sortedItems.filter(p => {
            if (showHistory) return true;
            if (activeOrderStatuses.includes(status) || status === 'paused') return true;
            return new Date(p.created_at) >= twoMonthsAgo;
        });

        return (
            <div className={`flex-1 min-w-[280px] bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 flex flex-col h-full border border-gray-100 dark:border-slate-700 relative ${displayedItems.length === 0 ? 'opacity-75' : ''}`}>
                <h3 className={`font-black uppercase text-xs mb-4 flex items-center gap-2 ${color}`}>
                    <span className="size-2 rounded-full bg-current"></span>
                    {title}
                    <span className="ml-auto bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-2 rounded-full text-[10px] text-gray-500">{displayedItems.length}</span>
                </h3>
                <div className={`flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar transition-all ${isOrdering ? 'p-2 rounded-xl bg-purple-50/50 border-2 border-dashed border-purple-200' : ''}`}>
                    {displayedItems.map((p: any) => (
                        <div
                            key={p.id}
                            onClick={() => handleCardClick(p)}
                            className={`bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 relative transition-all group
                                ${isOrdering ? 'cursor-pointer hover:border-purple-500 hover:shadow-md hover:scale-[1.02] active:scale-95' : 'cursor-pointer hover:border-blue-300 hover:shadow-md'}
                            `}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex gap-2 items-center">
                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${p.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                                        p.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                                            'bg-blue-50 text-blue-600'
                                        }`}>{p.priority === 'urgent' ? 'Urgente' : p.priority === 'high' ? 'Alta' : 'Normal'}</span>
                                    {p.execution_order > 0 && (
                                        <span className="bg-purple-600 text-white px-1.5 py-0.5 rounded text-[10px] font-black border border-purple-700 shadow-sm">
                                            #{p.execution_order}
                                        </span>
                                    )}
                                </div>
                                {p.deadline && <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1"><span className="material-symbols-outlined text-[10px]">event</span> {new Date(p.deadline).toLocaleDateString().slice(0, 5)}</span>}
                            </div>
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm leading-tight mb-2">{p.title}</h4>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">person</span> {p.requester}</div>
                                {!isOrdering && <span className="material-symbols-outlined text-gray-300 opacity-0 group-hover:opacity-100">edit</span>}
                                {isOrdering && <span className="text-[10px] font-bold text-purple-600 uppercase">Definir Ordem</span>}
                            </div>
                        </div>
                    ))}
                    {displayedItems.length === 0 && <div className="text-center text-gray-300 text-xs py-8 italic border-2 border-dashed border-gray-100 rounded-xl">Sem projetos</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-10 max-w-[1600px] mx-auto h-[calc(100vh-80px)] flex flex-col">
            <div className="flex justify-between items-center mb-8 shrink-0">
                <div>
                    <h2 className="text-[#111318] dark:text-white text-3xl font-black tracking-tight flex items-center gap-3">
                        <span className="material-symbols-outlined text-purple-500 text-4xl">architecture</span>
                        Banco de Projetos
                    </h2>
                    <p className="text-[#616f89] dark:text-gray-400 text-sm font-medium">Gestão de Demandas de Engenharia e Arquitetura</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Ordering Tools */}
                    {isOrdering ? (
                        <div className="flex items-center gap-2 bg-purple-100 dark:bg-purple-900/30 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 animate-in slide-in-from-right-10">
                            <span className="text-xs font-bold text-purple-600 dark:text-purple-300 mr-2 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm animate-pulse">touch_app</span>
                                Clique nos cards para definir a ordem ({nextOrderVal}º)
                            </span>
                            <button onClick={handleResetOrdering} className="bg-white text-red-500 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50">
                                Resetar Tudo
                            </button>
                            <button onClick={() => setIsOrdering(false)} className="bg-purple-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-purple-700">
                                Concluir
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setIsOrdering(true)} className="text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 font-bold px-3 py-2 rounded-xl flex items-center gap-2 text-xs transition-colors">
                            <span className="material-symbols-outlined text-sm">sort</span>
                            Organizar Fila
                        </button>
                    )}

                    <div className="h-8 w-px bg-gray-200 dark:bg-slate-700 mx-2"></div>

                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer select-none bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700">
                        <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} className="accent-purple-600" />
                        Histórico Antigo
                    </label>

                    <button onClick={() => generateReport()} className="bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-200 font-bold px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2">
                        <span className="material-symbols-outlined">print</span>
                    </button>

                    <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/20 flex items-center gap-2">
                        <span className="material-symbols-outlined">add_task</span>
                        Nova Demanda
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 mb-4 shrink-0">
                {boardTabs.map(tab => {
                    const count = projects.filter(p => tab.statuses.includes(normalizeProjectStatus(p.status))).length;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setBoardTab(tab.key as 'project' | 'work')}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase border transition-all flex items-center gap-2 ${boardTab === tab.key ? 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-500/20' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-purple-300'}`}
                        >
                            {tab.label}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] ${boardTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}>{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* Kanban Board - Height adjustment for footer spacing */}
            <div className={`flex md:flex-row flex-col gap-6 overflow-x-auto h-full pb-4 scroll-smooth transition-opacity ${isOrdering ? 'opacity-100' : 'opacity-100'}`}>
                {boardTabs.find(tab => tab.key === boardTab)?.statuses.map(status => (
                    <StatusColumn
                        key={status}
                        title={getStatusInfo(status).label}
                        status={status}
                        color={getStatusInfo(status).color}
                        items={projects.filter(p => normalizeProjectStatus(p.status) === status)}
                    />
                ))}
                {false && <>
                <StatusColumn
                    title="Novas Demandas"
                    status="demanded"
                    color="text-gray-500"
                    items={projects.filter(p => p.status === 'demanded')}
                />
                <StatusColumn
                    title="Em Elaboração"
                    status="in_progress"
                    color="text-blue-500"
                    items={projects.filter(p => p.status === 'in_progress')}
                />
                <StatusColumn
                    title="Concluídos"
                    status="completed"
                    color="text-green-500"
                    items={projects.filter(p => p.status === 'completed')}
                />
                <StatusColumn
                    title="Entregues (Protocolados)"
                    status="delivered"
                    color="text-purple-500"
                    items={projects.filter(p => p.status === 'delivered')}
                />
                </>}
            </div>

            {/* Create Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* ... existing Create content ... */}
                        <h3 className="font-black text-xl mb-6 flex items-center gap-2"><span className="material-symbols-outlined text-purple-500">add_task</span> Nova Demanda</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Título do Projeto</label>
                                <input autoFocus type="text" className="w-full bg-gray-50 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl p-3 outline-none focus:border-purple-500 font-bold"
                                    value={newProj.title} onChange={e => setNewProj({ ...newProj, title: e.target.value })} placeholder="Ex: Reforma Escola X" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Solicitante</label>
                                    <select className="w-full bg-gray-50 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl p-3 outline-none focus:border-purple-500 mb-2"
                                        value={newProj.requester} onChange={e => setNewProj({ ...newProj, requester: e.target.value })}>
                                        <option value="Prefeito">Gabinete do Prefeito</option>
                                        <option value="Educação">Sec. Educação</option>
                                        <option value="Saúde">Sec. Saúde</option>
                                        <option value="Administração">Sec. Administração</option>
                                        <option value="Fazenda">Sec. Fazenda</option>
                                        <option value="Assistência Social">Sec. Assist. Social</option>
                                        <option value="Outros">Outros (Especificar)</option>
                                    </select>
                                    {newProj.requester === 'Outros' && (
                                        <input
                                            type="text"
                                            autoFocus
                                            className="w-full bg-purple-50 border border-purple-200 rounded-xl p-3 outline-none focus:border-purple-500 text-purple-800 font-bold text-sm"
                                            placeholder="Digite o nome do solicitante..."
                                            value={newProj.customRequester}
                                            onChange={e => setNewProj({ ...newProj, customRequester: e.target.value })}
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Prioridade</label>
                                    <select className="w-full bg-gray-50 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl p-3 outline-none focus:border-purple-500"
                                        value={newProj.priority} onChange={e => setNewProj({ ...newProj, priority: e.target.value })}>
                                        <option value="normal">Normal</option>
                                        <option value="high">Alta</option>
                                        <option value="urgent">Urgente</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ordem de Execução (Opcional)</label>
                                    <input type="number" className="w-full bg-gray-50 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl p-3 outline-none focus:border-purple-500"
                                        value={newProj.execution_order} onChange={e => setNewProj({ ...newProj, execution_order: parseInt(e.target.value) || 0 })} placeholder="0" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Prazo Esperado</label>
                                    <input type="date" className="w-full bg-gray-50 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl p-3 outline-none focus:border-purple-500"
                                        value={newProj.deadline} onChange={e => setNewProj({ ...newProj, deadline: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descrição</label>
                                <textarea rows={3} className="w-full bg-gray-50 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 rounded-xl p-3 outline-none focus:border-purple-500"
                                    value={newProj.description} onChange={e => setNewProj({ ...newProj, description: e.target.value })} placeholder="Detalhes..." />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-8">
                            <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700">Cancelar</button>
                            <button onClick={handleCreate} className="px-6 py-3 rounded-xl font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/20">Criar Demanda</button>
                        </div>
                    </div>
                </div>
            )}

            {/* DETAIL MODAL (COMPACT CENTER STYLE) */}
            {selectedProject && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative">
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getStatusInfo(selectedProject.status).bar}`}></div>

                        {/* Header */}
                        <div className="px-8 py-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-start bg-white dark:bg-slate-900 shrink-0">
                            <div className="min-w-0 flex-1 pr-6">
                                {/* ... existing header ... */}
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`px-3 py-1 rounded-full text-[11px] uppercase font-black border inline-flex items-center gap-1.5 ${getStatusInfo(selectedProject.status).badge}`}>
                                        <span className="material-symbols-outlined text-sm">{getStatusInfo(selectedProject.status).icon}</span>
                                        {getStatusInfo(selectedProject.status).label}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${selectedProject.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                                        selectedProject.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                                            'bg-blue-50 text-blue-600'
                                        }`}>{selectedProject.priority === 'urgent' ? 'Urgente' : selectedProject.priority === 'high' ? 'Alta' : 'Normal'}</span>
                                    {selectedProject.execution_order > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-gray-200">Ordem #{selectedProject.execution_order}</span>}
                                    <span className="text-gray-400 text-xs flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">calendar_today</span> {new Date(selectedProject.created_at).toLocaleDateString()}</span>
                                </div>
                                <h2 className="text-2xl font-black text-gray-800 dark:text-white uppercase tracking-tight">{selectedProject.title}</h2>
                                <p className="text-gray-500 text-sm mt-1">Solicitado por: <strong>{selectedProject.requester}</strong></p>
                                <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
                                    {mainStatusFlow.map((status, idx) => {
                                        const currentStatus = normalizeProjectStatus(selectedProject.status);
                                        const currentIdx = currentStatus === 'paused' ? mainStatusFlow.indexOf(selectedProject.previous_status || 'in_progress') : mainStatusFlow.indexOf(currentStatus);
                                        const reached = idx <= currentIdx;
                                        return (
                                            <div key={status} className="flex items-center gap-2 shrink-0">
                                                {idx > 0 && <div className={`w-6 h-0.5 rounded-full ${reached ? getStatusInfo(status).bar : 'bg-gray-200 dark:bg-slate-700'}`}></div>}
                                                <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase ${reached ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>
                                                    <span className={`size-5 rounded-full flex items-center justify-center text-[10px] ${reached ? getStatusInfo(status).bar + ' text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-400'}`}>{idx + 1}</span>
                                                    {getStatusInfo(status).shortLabel}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {normalizeProjectStatus(selectedProject.status) === 'paused' && (
                                    <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-700">
                                        <strong>Motivo da paralisacao:</strong> {selectedProject.pause_reason || 'Registrado na descricao do projeto.'}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setSelectedProject(null)} className="bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 rounded-full p-2 text-gray-500 dark:text-gray-300 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Main Content */}
                        <div className="flex flex-1 overflow-hidden bg-gray-50/50 dark:bg-slate-800/50">

                            {/* LEFT: INFO & FILES */}
                            <div className="w-[400px] border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-y-auto flex flex-col">

                                {/* Status Control */}
                                <div className="p-6 border-b border-gray-100 dark:border-slate-700 space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Status do Projeto</label>
                                        <select
                                            value={normalizeProjectStatus(selectedProject.status)}
                                            onChange={(e) => handleUpdateStatus(e.target.value)}
                                            className="w-full p-3 font-bold rounded-xl border border-gray-200 dark:border-slate-600 outline-none focus:border-purple-500 bg-gray-50 dark:bg-slate-800 dark:text-gray-200"
                                        >
                                            {getAvailableStatuses(selectedProject.status).map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Ordem de Execução</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 text-sm font-bold rounded-xl border border-gray-200 dark:border-slate-600 outline-none focus:border-purple-500 bg-gray-50 cursor-text"
                                                value={selectedProject.execution_order || 0}
                                                onChange={(e) => handleUpdateOrder(parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <button onClick={initiateDelete} className="p-2.5 text-white bg-red-400 hover:bg-red-500 rounded-xl transition-colors" title="Excluir Demanda">
                                                <span className="material-symbols-outlined">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Files Section */}
                                <div className="flex-1 p-6">
                                    {/* ... existing file upload ... */}
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-bold text-gray-400 text-xs uppercase">Arquivos</h4>
                                        <label className={`cursor-pointer text-purple-600 hover:text-purple-700 text-xs font-bold flex items-center gap-1 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100 transition-all ${uploadQueue.some(u => u.status === 'uploading' || u.status === 'pending') ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <span className="material-symbols-outlined text-sm">upload</span>
                                            Adicionar
                                            <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                                        </label>
                                    </div>
                                    {/* ... Rest of files ... */}
                                    {/* Upload Queue */}
                                    {uploadQueue.length > 0 && (
                                        <div className="mb-4 bg-purple-50 dark:bg-slate-800 rounded-xl p-3 border border-purple-100 dark:border-slate-700">
                                            <p className="text-[10px] font-bold text-purple-800 dark:text-purple-300 mb-2">ENVIANDO ARQUIVOS...</p>
                                            <div className="space-y-2">
                                                {uploadQueue.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-center text-xs">
                                                        <span className="truncate max-w-[150px]">{item.name}</span>
                                                        {item.status === 'pending' && <span className="text-gray-400">Aguardando...</span>}
                                                        {item.status === 'uploading' && <span className="text-purple-600 font-bold animate-pulse">Enviando...</span>}
                                                        {item.status === 'done' && <span className="text-green-500 font-bold">Concluído</span>}
                                                        {item.status === 'error' && <span className="text-red-500 font-bold">Erro</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3 pb-4">
                                        {getGroupedFiles().map(group => {
                                            const defaultOpenKey = getDefaultOpenGroupKey();
                                            const isOpen = openFileGroups[group.key] ?? group.key === defaultOpenKey;

                                            return (
                                                <div key={group.key} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                                                    <button
                                                        onClick={() => setOpenFileGroups(prev => ({ ...prev, [group.key]: !isOpen }))}
                                                        className={`w-full px-3 py-2.5 flex items-center gap-2 border-b ${isOpen ? 'border-gray-100 dark:border-slate-700' : 'border-transparent'} ${group.bg}`}
                                                    >
                                                        <span className={`material-symbols-outlined text-lg ${group.color}`}>{group.icon}</span>
                                                        <span className="font-black text-xs uppercase text-gray-700 dark:text-gray-200">{group.label}</span>
                                                        <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-800 text-gray-500 border border-white/60">{group.files.length}</span>
                                                        <span className={`material-symbols-outlined text-base text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                                    </button>

                                                    {isOpen && (
                                                        <div className="p-2 space-y-2">
                                                            {group.files.map(f => {
                                                                const ext = getFileExtension(f.title).toUpperCase() || 'ARQ';
                                                                return (
                                                                    <div key={f.id} className="bg-gray-50 dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 flex items-start gap-3 group hover:border-blue-300 transition-all">
                                                                        <div className={`size-9 ${group.bg} ${group.color} rounded-lg flex items-center justify-center shrink-0 border`}>
                                                                            <span className="material-symbols-outlined text-lg">{isPdfFile(f) ? 'picture_as_pdf' : group.icon}</span>
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-start gap-2">
                                                                                <p
                                                                                    className="font-bold text-xs text-gray-700 dark:text-gray-300 leading-snug break-words"
                                                                                    title={f.title}
                                                                                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                                                                >
                                                                                    {f.title}
                                                                                </p>
                                                                                <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-500">.{ext}</span>
                                                                            </div>
                                                                            <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                                                                <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                                                {f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString() : 'Sem data'}
                                                                            </p>
                                                                            {!isPdfFile(f) && <p className="text-[10px] text-gray-400 mt-0.5">Visualizacao indisponivel para este tipo</p>}
                                                                        </div>
                                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                                            <button onClick={() => handleViewFile(f)} className={`p-1.5 rounded-full ${isPdfFile(f) ? 'text-purple-500 hover:bg-purple-50' : 'text-gray-300 hover:bg-gray-100'}`} title="Visualizar"><span className="material-symbols-outlined text-base">visibility</span></button>
                                                                            <button onClick={() => handleDownloadFile(f)} className="p-1.5 hover:bg-gray-200 rounded-full text-blue-500" title="Baixar"><span className="material-symbols-outlined text-base">download</span></button>
                                                                            <button onClick={() => handleDeleteFile(f.id)} className="p-1.5 hover:bg-red-50 rounded-full text-red-400" title="Excluir"><span className="material-symbols-outlined text-base">delete</span></button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {files.length === 0 && uploadQueue.length === 0 && (
                                            <div className="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400">
                                                <p className="text-xs">Sem arquivos</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {selectedProject.status === 'completed' && (
                                    <div className="p-6 border-t border-gray-100 dark:border-slate-700">
                                        <button onClick={handleDelivery} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 transition-all text-sm">
                                            <span className="material-symbols-outlined">assignment_turned_in</span>
                                            Registrar Entrega
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* RIGHT: HISTORY & DESC */}
                            <div className="flex-1 p-8 overflow-y-auto">
                                <div className="mb-8">
                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2 text-sm uppercase">Descrição / Observações</h4>
                                    <textarea
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-purple-500 focus:ring-2 ring-purple-500/10 transition-all leading-relaxed"
                                        rows={6}
                                        value={selectedProject.description || ''}
                                        onChange={(e) => handleUpdateDescription(e.target.value)}
                                        placeholder="Adicione detalhes sobre o projeto aqui..."
                                    />
                                    <p className="text-[10px] text-gray-400 mt-2 text-right">Alterações salvas automaticamente.</p>
                                </div>

                                <h4 className="font-bold text-gray-400 text-xs uppercase mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">history</span> Histórico de Entregas
                                </h4>

                                <div className="space-y-3">
                                    {deliveries.map(dev => (
                                        <div key={dev.id} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-4 rounded-xl flex justify-between items-center shadow-sm group">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Entregue</span>
                                                    <span className="text-gray-400 text-xs">• {new Date(dev.delivered_at).toLocaleDateString()}</span>
                                                </div>
                                                <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">Para: {dev.delivered_to}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handlePrintProtocol(dev)} className="px-3 py-1.5 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600 rounded-lg text-xs font-bold hover:bg-white hover:border-purple-300 hover:text-purple-600 transition-all flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">print</span> Protocolo
                                                </button>
                                                <button onClick={() => handleDeleteDelivery(dev.id)} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Cancelar entrega">
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {deliveries.length === 0 && (
                                        <div className="p-8 text-center bg-transparent opacity-50">
                                            <p className="text-gray-500 text-xs">Nenhuma entrega registrada.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* PAUSE REASON MODAL */}
            {pauseModal && selectedProject && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-100 dark:border-red-900/40">
                        <div className="flex items-start gap-3 mb-5">
                            <div className="size-11 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined">pause_circle</span>
                            </div>
                            <div>
                                <h3 className="font-black text-lg text-gray-900 dark:text-white">Paralisar Projeto</h3>
                                <p className="text-xs text-gray-500 mt-1">Ao retomar, o projeto volta para {getStatusInfo(pauseModal.previousStatus).label}.</p>
                            </div>
                        </div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Motivo da paralisacao</label>
                        <textarea
                            autoFocus
                            rows={4}
                            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-sm outline-none focus:border-red-400 focus:ring-2 ring-red-500/10"
                            value={pauseModal.reason}
                            onChange={e => setPauseModal({ ...pauseModal, reason: e.target.value })}
                            placeholder="Ex: aguardando recurso, pendencia documental, decisao administrativa..."
                        />
                        <div className="flex justify-end gap-3 mt-5">
                            <button onClick={() => setPauseModal(null)} className="px-4 py-2 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800">Cancelar</button>
                            <button onClick={confirmPauseStatus} className="px-5 py-2 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* PDF VIEWER MODAL */}
            {pdfViewer && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-6xl h-[92vh] shadow-2xl flex flex-col overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="material-symbols-outlined text-red-500">picture_as_pdf</span>
                                <h3 className="font-black text-sm text-gray-800 dark:text-white truncate">{pdfViewer.title}</h3>
                            </div>
                            <button onClick={() => setPdfViewer(null)} className="bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full p-2 text-gray-500 dark:text-gray-300 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <iframe
                            src={pdfViewer.src}
                            title={pdfViewer.title}
                            className="w-full flex-1 bg-gray-100 dark:bg-slate-950"
                        />
                    </div>
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {isDeleteModalOpen && selectedProject && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex gap-4 items-start mb-6">
                            <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                                <span className="material-symbols-outlined text-3xl">delete_forever</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Excluir Projeto</h3>
                                <p className="text-sm text-gray-500 font-medium leading-tight mt-1">Essa ação é irreversível.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-400">Sua senha de acesso</label>
                                <input
                                    type="password"
                                    className="w-full border-2 border-gray-100 p-3 rounded-xl mt-1 focus:border-gray-400 outline-none font-bold"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!password}
                                >
                                    Confirmar Exclusão
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DesignProjects;
