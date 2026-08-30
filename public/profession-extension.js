(() => {
  if (typeof PROFESSIONS === 'undefined' || typeof PROFESSION_BY_ID === 'undefined') return;

  const extras = [
    {
      id: 'civilServant',
      name: '公務員',
      image: '/images/civil%20servant.png',
      abilities: [
        { label: '薪資', grade: 'B' },
        { label: '選股', grade: 'A' },
        { label: '圈地', grade: 'A' },
        { label: '圓夢', grade: 'A' },
      ],
    },
    {
      id: 'artist',
      name: '藝人',
      image: '/images/artist.png',
      abilities: [
        { label: '薪資', grade: 'A' },
        { label: '選股', grade: 'B' },
        { label: '圈地', grade: 'C' },
        { label: '圓夢', grade: 'S' },
      ],
    },
  ];

  extras.forEach((profession) => {
    if (PROFESSION_BY_ID[profession.id]) return;
    PROFESSIONS.push(profession);
    PROFESSION_BY_ID[profession.id] = profession;
  });
})();
