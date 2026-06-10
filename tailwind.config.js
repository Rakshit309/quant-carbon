/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:      '#080c14',
        surface: '#0d1421',
        surface2:'#111927',
        border:  '#1a2d45',
        blue:    '#3b8bfd',
        green:   '#2dd67a',
        amber:   '#f0a830',
        red:     '#f05149',
        purple:  '#a87cff',
        teal:    '#2dd6c8',
        dim:     '#4a6480',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}