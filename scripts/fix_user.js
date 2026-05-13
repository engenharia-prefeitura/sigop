import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig } from './supabaseConfig.js';

const { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY } = loadSupabaseConfig();

if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY nao definida no .env.local');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const userEmail = 'eng.susanybonin@gmail.com';
const newPassword = '123456';

async function fixUser() {
    try {
        console.log(`Procurando usuario: ${userEmail}`);

        const { data: users, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) {
            console.error('Erro ao listar usuarios:', listError);
            return;
        }

        const user = users.users.find(u => u.email === userEmail);

        if (!user) {
            console.error(`Usuario ${userEmail} nao encontrado!`);
            return;
        }

        console.log('Usuario encontrado!');
        console.log(`ID: ${user.id}`);
        console.log(`Email: ${user.email}`);
        console.log(`Email confirmado: ${user.email_confirmed_at ? 'SIM' : 'NAO'}`);
        console.log(`Criado em: ${user.created_at}`);

        if (!user.email_confirmed_at) {
            console.log('Confirmando email...');
            const { error: updateError } = await supabase.auth.admin.updateUserById(
                user.id,
                { email_confirm: true }
            );

            if (updateError) {
                console.error('Erro ao confirmar email:', updateError);
            } else {
                console.log('Email confirmado com sucesso!');
            }
        }

        console.log(`Resetando senha para: ${newPassword}`);
        const { error: passwordError } = await supabase.auth.admin.updateUserById(
            user.id,
            { password: newPassword }
        );

        if (passwordError) {
            console.error('Erro ao resetar senha:', passwordError);
        } else {
            console.log('Senha resetada com sucesso!');
            console.log('\nCREDENCIAIS ATUALIZADAS:');
            console.log(`Email: ${userEmail}`);
            console.log(`Senha: ${newPassword}`);
            console.log('\nPeca para o usuario trocar a senha apos o primeiro login!\n');
        }

    } catch (err) {
        console.error('Erro:', err.message);
    }
}

fixUser();
