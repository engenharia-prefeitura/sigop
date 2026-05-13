import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig } from './supabaseConfig.js';

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = loadSupabaseConfig();

if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY nao definida no .env.local');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function processQueue() {
    const { data: tasks } = await supabase.from('admin_tasks').select('*').eq('status', 'pending').limit(5);

    if (tasks && tasks.length > 0) {
        console.log(`Processing ${tasks.length} tasks...`);

        for (const task of tasks) {
            try {
                await supabase.from('admin_tasks').update({ status: 'processing' }).eq('id', task.id);

                let result;
                if (task.task_type === 'create_user') {
                    result = await supabase.auth.admin.createUser({
                        email: task.payload.email,
                        password: task.payload.password,
                        email_confirm: true,
                        user_metadata: task.payload.metadata
                    });

                    if (result.data && result.data.user) {
                        const userId = result.data.user.id;
                        const fullName = task.payload.metadata?.full_name || '';
                        const nameParts = fullName.trim().split(' ');
                        const firstName = nameParts[0] || '';
                        const lastName = nameParts[nameParts.length - 1] || '';
                        const initials = `${firstName}+${lastName}`.replace(/\+$/, '');
                        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=0D8ABC&color=fff`;

                        const { error: profileError } = await supabase
                            .from('profiles')
                            .upsert({
                                id: userId,
                                email: task.payload.email,
                                full_name: fullName,
                                avatar_url: avatarUrl,
                                role: task.payload.metadata?.role || 'user',
                                role_title: task.payload.metadata?.role_title || '',
                                crea: task.payload.metadata?.crea || '',
                                is_admin: task.payload.metadata?.is_admin || false,
                                is_active: true,
                                signature_url: null,
                                updated_at: new Date().toISOString()
                            }, {
                                onConflict: 'id'
                            });

                        if (profileError) {
                            console.error('Erro ao criar perfil:', profileError);
                            throw profileError;
                        }
                    }
                } else if (task.task_type === 'update_auth') {
                    const updates = {};
                    if (task.payload.email) updates.email = task.payload.email;
                    if (task.payload.password) updates.password = task.payload.password;
                    result = await supabase.auth.admin.updateUserById(task.payload.userId, updates);

                } else if (task.task_type === 'delete_user') {
                    result = await supabase.auth.admin.deleteUser(task.payload.userId);
                }

                if (result.error) throw result.error;

                await supabase.from('admin_tasks').update({ status: 'done', result: 'Success' }).eq('id', task.id);
                console.log(`Task ${task.id} (${task.task_type}) completed.`);

            } catch (err) {
                console.error(`Task ${task.id} failed:`, err.message);
                await supabase.from('admin_tasks').update({ status: 'error', result: err.message }).eq('id', task.id);
            }
        }
    }
}

console.log('Admin Worker started. Waiting for tasks...');
setInterval(processQueue, 3000);
