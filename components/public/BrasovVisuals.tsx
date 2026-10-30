export const brasovPanorama = {
  src: 'https://images.unsplash.com/photo-1763900933046-001f2c67ae93?auto=format&fit=crop&w=2400&q=85',
  alt: 'Panoramă peste acoperișurile Brașovului, cu Biserica Neagră și muntele Tâmpa în depărtare',
};

export const brasovOldTown = {
  src: 'https://images.unsplash.com/photo-1754836982329-92ff4ac13d77?auto=format&fit=crop&w=2000&q=85',
  alt: 'Biserica Neagră și centrul istoric al Brașovului, cu muntele Tâmpa în fundal',
};

export function BrasovPhotoCredit({
  photo,
  className = '',
}: {
  photo: 'panorama' | 'old-town';
  className?: string;
}) {
  const credit = photo === 'panorama'
    ? {
        author: 'Patron Catalin',
        source: 'https://unsplash.com/photos/historic-european-city-with-church-and-mountain-backdrop-HDpzCYpHp8M',
        license: 'https://unsplash.com/license',
        licenseName: 'Unsplash License',
      }
    : {
        author: 'Andy Arbeit',
        source: 'https://unsplash.com/photos/medieval-town-with-a-large-church-and-mountain-background-dVUJWokVkRA',
        license: 'https://unsplash.com/license',
        licenseName: 'Unsplash License',
      };

  return (
    <p className={`kira-photo-credit ${className}`}>
      Fotografie: <a href={credit.source} target="_blank" rel="noreferrer">{credit.author}</a>
      {' · '}
      <a href={credit.license} target="_blank" rel="noreferrer">{credit.licenseName}</a>
      {' · decupare pentru afișare'}
    </p>
  );
}
