import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path (/<repo>/ or a custom domain).
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Engine tests land from a parallel branch; don't fail CI while a folder has none yet.
    passWithNoTests: true,
  },
});
