import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
  input: './src/index.tsx',
  output: { file: './dist/index.js', format: 'iife', name: 'DeckyBooks' },
  plugins: [resolve(), commonjs(), typescript()],
  external: ['react', 'react-dom', '@decky/ui', '@decky/api']
};
