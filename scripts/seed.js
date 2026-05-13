import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig } from './supabaseConfig.js';

const {
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SERVICE_ROLE_KEY,
    adminEmail: ADMIN_EMAIL
} = loadSupabaseConfig();

if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY nao definida no .env.local');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function ensureProfile(userId, email) {
    const fullName = 'Dennylson Alves dos Santos';
    const roleTitle = 'Engenheiro Civil';
    const crea = '183461-7';
    const avatarUrl = 'https://ui-avatars.com/api/?name=Dennylson+Santos&background=0D8ABC&color=fff';

    const { error } = await supabase.from('profiles').upsert({
        id: userId,
        email,
        full_name: fullName,
        avatar_url: avatarUrl,
        role: 'user',
        role_title: roleTitle,
        crea,
        is_admin: true,
        is_active: true,
        signature_url: null,
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'id'
    });

    if (error) {
        throw error;
    }
}

async function seed() {
    console.log('Iniciando seed do banco de dados...');

    const email = ADMIN_EMAIL || 'eng.dennylsonsantos@gmail.com';
    const password = 'Denny0804*';

    console.log(`Criando/Buscando usuario: ${email}...`);

    let userId;
    const { data: listUsers } = await supabase.auth.admin.listUsers();
    const existingUser = listUsers.users.find(u => u.email === email);

    if (existingUser) {
        console.log('Usuario ja existe. Atualizando metadados...');
        userId = existingUser.id;
        await supabase.auth.admin.updateUserById(userId, {
            user_metadata: {
                full_name: 'Dennylson Alves dos Santos',
                role_title: 'Engenheiro Civil',
                crea: '183461-7',
                avatar_url: 'https://ui-avatars.com/api/?name=Dennylson+Santos&background=0D8ABC&color=fff'
            }
        });
    } else {
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: 'Dennylson Alves dos Santos',
                role_title: 'Engenheiro Civil',
                crea: '183461-7',
                avatar_url: 'https://ui-avatars.com/api/?name=Dennylson+Santos&background=0D8ABC&color=fff'
            }
        });

        if (createError) {
            console.error('Erro ao criar usuario:', createError.message);
            return;
        }
        console.log('Usuario criado com sucesso!');
        userId = newUser.user.id;
    }

    await ensureProfile(userId, email);

    console.log('Inserindo documentos de exemplo...');

    const docs = [
        {
            title: 'Relatorio Estrutural Ponte Norte',
            type: 'Relatorio Tecnico',
            status: 'finished',
            created_by: userId,
            content: { description: 'Analise detalhada da estrutura...' },
            updated_at: new Date('2024-10-24T10:00:00')
        },
        {
            title: 'Solicitacao Ajuste Orcamentario Q4',
            type: 'Memorando',
            status: 'raskin',
            created_by: userId,
            content: { description: 'Solicitacao de verba adicional...' },
            updated_at: new Date('2024-10-22T14:30:00')
        },
        {
            title: 'Expansao de Rede de Agua Centro',
            type: 'Plano Tecnico',
            status: 'waiting_signature',
            created_by: userId,
            content: { blocks: [] },
            updated_at: new Date('2024-10-21T09:15:00')
        },
        {
            title: 'Auditoria de Seguranca Canteiro B',
            type: 'Inspecao',
            status: 'rejected',
            created_by: userId,
            content: { items: ['Capacetes', 'Luvas'] },
            updated_at: new Date('2024-10-19T16:45:00')
        },
        {
            title: 'Requisicao de Materiais Rodovia 7',
            type: 'Requisicao',
            status: 'finished',
            created_by: userId,
            content: { materials: ['Asfalto', 'Brita'] },
            updated_at: new Date('2024-10-15T11:20:00')
        },
        {
            title: 'Manutencao Preventiva Semaforos',
            type: 'Ordem de Servico',
            status: 'raskin',
            created_by: userId,
            content: {},
            updated_at: new Date()
        }
    ];

    for (const doc of docs) {
        const { data: existing } = await supabase.from('documents').select('id').eq('title', doc.title).eq('created_by', userId).single();

        if (!existing) {
            const { error } = await supabase.from('documents').insert(doc);
            if (error) {
                console.error(`Erro inserindo doc "${doc.title}":`, error.message);
            } else {
                console.log(`Inserido: ${doc.title}`);
            }
        } else {
            console.log(`Documento ja existe: ${doc.title}`);
        }
    }

    console.log('\nConfiguracao concluida! Acesse com:');
    console.log(`Email: ${email}`);
    console.log(`Senha: ${password}`);
}

seed().catch(console.error);
