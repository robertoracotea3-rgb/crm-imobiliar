export const brasovPanorama = {
  src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Bra%C5%9Fov_-_panorama.jpg/3840px-Bra%C5%9Fov_-_panorama.jpg',
  alt: 'Panoramă peste acoperișurile Brașovului, cu Biserica Neagră și muntele Tâmpa în depărtare',
};

export const brasovOldTown = {
  src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Panorama_of_Bra%C8%99ov_old_town_with_the_Black_Church_and_Mount_T%C3%A2mpa_%282025%29.jpg/1280px-Panorama_of_Bra%C8%99ov_old_town_with_the_Black_Church_and_Mount_T%C3%A2mpa_%282025%29.jpg',
  alt: 'Centrul vechi al Brașovului, Biserica Neagră și muntele Tâmpa',
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
        author: 'Pudelek (Marcin Szala)',
        source: 'https://commons.wikimedia.org/wiki/File:Bra%C5%9Fov_-_panorama.jpg',
        license: 'https://creativecommons.org/licenses/by-sa/3.0/',
        licenseName: 'CC BY-SA 3.0',
      }
    : {
        author: 'Paul Colin Hennig · firstdorsal.eu',
        source: 'https://commons.wikimedia.org/wiki/File:Panorama_of_Bra%C8%99ov_old_town_with_the_Black_Church_and_Mount_T%C3%A2mpa_(2025).jpg',
        license: 'https://creativecommons.org/licenses/by-sa/4.0/',
        licenseName: 'CC BY-SA 4.0',
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
