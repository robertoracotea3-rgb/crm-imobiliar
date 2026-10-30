type KiraLogoProps = { className?: string };

export function KiraLogo({ className = '' }: KiraLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 278 72"
      role="img"
      aria-label="Kira Imobiliare"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="kiraGold" x1="8" y1="12" x2="59" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4D28A" />
          <stop offset=".52" stopColor="#D3A854" />
          <stop offset="1" stopColor="#A8782F" />
        </linearGradient>
      </defs>
      <g stroke="url(#kiraGold)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 35.5 31 10l27 25.5h-9L31 18.8 13 35.5H4Z" fill="url(#kiraGold)" strokeWidth="1.2" />
        <path d="M12 34v25h38V34" strokeWidth="1.8" />
        <path d="M24 59V43h14v16" strokeWidth="1.6" />
        <path d="M17 40h3m22 0h3M17 47h3m22 0h3" strokeWidth="2.1" />
      </g>
      <text x="76" y="40" fill="#FFF9ED" fontFamily="Georgia, 'Times New Roman', serif" fontSize="35" fontWeight="600" letterSpacing="2.1">KIRA</text>
      <text x="79" y="59" fill="#D7AE63" fontFamily="Arial, Helvetica, sans-serif" fontSize="10.5" fontWeight="500" letterSpacing="4.2">IMOBILIARE</text>
      <path d="M250 55h19" stroke="#D7AE63" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
