import { defineConfig } from 'vite';
export default defineConfig({base:'./',build:{rollupOptions:{output:{manualChunks:{supabase:['@supabase/supabase-js']}}}}});
