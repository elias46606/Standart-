import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relativer Pfad, damit die App auch unter einem Unterpfad
  // (z. B. GitHub Pages: /Standart-/) korrekt lädt.
  base: './',
})
