'use client';

import { useEffect } from 'react';

export function PublicMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

    const root = document.querySelector('.kira-public');
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('main > :not(script)'));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('kira-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -32px 0px' });

    targets.forEach((target, index) => {
      target.classList.add('kira-reveal');
      target.style.setProperty('--reveal-order', String(index % 5));
      observer.observe(target);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
