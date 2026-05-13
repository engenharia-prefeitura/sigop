import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env.local');

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};

    const env = {};
    const content = fs.readFileSync(filePath, 'utf8');

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        env[key] = value;
    }

    return env;
}

const fileEnv = parseEnvFile(envPath);

function getEnv(key, fallback = '') {
    return (process.env[key] || fileEnv[key] || fallback).trim();
}

export function loadSupabaseConfig() {
    const config = {
        supabaseUrl: getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL'),
        supabaseAnonKey: getEnv('SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY'),
        serviceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
        adminEmail: getEnv('SIGOP_ADMIN_EMAIL'),
    };

    if (!config.supabaseUrl) {
        throw new Error('SUPABASE_URL ou VITE_SUPABASE_URL nao definido no .env.local');
    }

    return config;
}
