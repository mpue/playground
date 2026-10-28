import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is one self-contained index.html: it can be opened from a file share
// or mailed around, and it is the template for "export app as HTML".
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: { port: 5180 },
  test: { environment: 'node' },
});
