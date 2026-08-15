import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
          output: {
            // Code splitting: dedicated vendor chunks so long-term cache stays valid
            manualChunks: {
              react: ['react', 'react-dom', 'react/jsx-runtime'],
              firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
              supabase: ['@supabase/supabase-js'],
              ffmpeg: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
              google: ['@google/genai'],
              ui: ['framer-motion', 'lucide-react', 'react-hot-toast'],
            },
          },
        },
      }
    };
});
