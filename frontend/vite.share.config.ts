import { defineConfig } from 'vite';
export default defineConfig({publicDir:false,build:{outDir:'dist-share',emptyOutDir:true,rollupOptions:{input:'share.html'}}});