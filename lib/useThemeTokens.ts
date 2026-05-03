'use client';

import { useEffect, useState } from 'react';

export interface ThemeTokens {
  text: string;
  textH: string;
  textDim: string;
  border: string;
  bgBase: string;
  bgSurface: string;
  bgCard: string;
  accent: string;
}

function leesTokens(): ThemeTokens {
  if (typeof window === 'undefined') {
    return { text: '#a0a8c0', textH: '#e8eaf6', textDim: '#5a607a', border: '#2e3148', bgBase: '#0f1117', bgSurface: '#1a1d27', bgCard: '#212433', accent: '#5c7cfa' };
  }
  const cs = getComputedStyle(document.documentElement);
  const get = (n: string, fb: string) => (cs.getPropertyValue(n).trim() || fb);
  return {
    text:      get('--text',       '#a0a8c0'),
    textH:     get('--text-h',     '#e8eaf6'),
    textDim:   get('--text-dim',   '#5a607a'),
    border:    get('--border',     '#2e3148'),
    bgBase:    get('--bg-base',    '#0f1117'),
    bgSurface: get('--bg-surface', '#1a1d27'),
    bgCard:    get('--bg-card',    '#212433'),
    accent:    get('--accent',     '#5c7cfa'),
  };
}

export function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(() => leesTokens());

  useEffect(() => {
    setTokens(leesTokens());
    function herlees() { setTokens(leesTokens()); }
    window.addEventListener('thema-toegepast', herlees);
    return () => window.removeEventListener('thema-toegepast', herlees);
  }, []);

  return tokens;
}
