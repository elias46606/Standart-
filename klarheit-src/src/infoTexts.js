// Die Erklärungen hinter jedem Anti-Schwächen-Feature.
// Diese Texte erscheinen beim Klick auf die ⓘ-Icons – der Kern der Präsentation.

export const INFO_TEXTS = {
  chronoFeed: {
    title: 'Chronologischer Feed mit klarem Ende',
    problem:
      'Heutige Plattformen nutzen algorithmische Feeds und Infinite Scroll: Es gibt nie ein Ende, der Feed lädt einfach immer weiter. Dieses Design ist bewusst dem Glücksspielautomaten nachempfunden („variable Belohnung") und führt dazu, dass Menschen deutlich länger scrollen, als sie eigentlich wollen.',
    solution:
      'Klarheit zeigt Beiträge streng chronologisch und sagt dir ehrlich, wann du alles gesehen hast. Ein Feed mit Ende respektiert deine Zeit – du entscheidest, wann Schluss ist, nicht der Algorithmus.',
  },
  hiddenLikes: {
    title: 'Verborgene Like-Zahlen',
    problem:
      'Öffentliche Like-Zahlen erzeugen sozialen Vergleichsdruck: Studien (z. B. der Royal Society for Public Health, „#StatusOfMind") verbinden diesen Vergleich mit Angstgefühlen und geringerem Selbstwert – besonders bei Jugendlichen. Instagram selbst hat deshalb 2019 Tests mit versteckten Likes gestartet.',
    solution:
      'Bei Klarheit kannst du weiterhin zeigen, dass dir etwas gefällt – aber niemand sieht Zahlen bei anderen. Nur du selbst siehst privat, wie deine eigenen Beiträge ankommen. Inhalte zählen, nicht Punktestände.',
  },
  usageTime: {
    title: 'Sichtbare Nutzungszeit & Pause-Erinnerung',
    problem:
      'Plattformen verdienen an jeder Minute deiner Aufmerksamkeit – deshalb verstecken sie, wie lange du schon scrollst. Die Zeit „verschwindet" unbemerkt: Im Schnitt verbringen Jugendliche über 2,5 Stunden täglich in sozialen Medien, oft ohne es zu merken.',
    solution:
      'Klarheit zeigt deine Nutzungszeit offen im Header an und erinnert dich freundlich an eine Pause. (Für diese Demo ist die Erinnerung auf 2 Minuten verkürzt – normal wären z. B. 20 Minuten.) Bewusste Nutzung statt verlorener Zeit.',
  },
  commentDelay: {
    title: 'Kommentar-Bedenkzeit',
    problem:
      'Hitzige Diskussionen und Hasskommentare entstehen oft aus dem Impuls heraus: tippen, abschicken, bereuen. Plattformen belohnen schnelle, emotionale Reaktionen, weil sie Engagement erzeugen – Studien zeigen, dass empörende Inhalte deutlich öfter geteilt werden.',
    solution:
      'Klarheit baut eine kleine Bedenkzeit von 10 Sekunden ein, bevor ein Kommentar abgeschickt werden kann. Wer kurz durchatmet, formuliert freundlicher – das senkt Impulsivität und verbessert den Ton spürbar.',
  },
  communityNotes: {
    title: 'Community-Notes: Kontext von Nutzern',
    problem:
      'Falschinformationen verbreiten sich in sozialen Medien bis zu sechsmal schneller als wahre Nachrichten (MIT-Studie, 2018). Zentrale Moderation kommt oft zu spät oder wirkt intransparent.',
    solution:
      'Bei Klarheit können Nutzerinnen und Nutzer gemeinsam Kontext zu Beiträgen ergänzen – sichtbar direkt am Post, mit Quellenangabe. Der Beitrag wird nicht gelöscht, sondern eingeordnet: Transparenz statt Zensur.',
  },
  dataExport: {
    title: 'Meine Daten exportieren',
    problem:
      'Viele Plattformen behandeln deine Daten wie ihr Eigentum: Exporte sind versteckt, unvollständig oder dauern Tage. Dabei garantiert die DSGVO (Art. 20) jedem das Recht auf Datenübertragbarkeit.',
    solution:
      'Klarheit gibt dir alle deine Daten mit einem Klick als lesbare JSON-Datei – sofort, vollständig und ohne Hürden. Deine Daten gehören dir, nicht der Plattform.',
  },
  accountDelete: {
    title: 'Account löschen – sofort und wirklich',
    problem:
      'Account-Löschung wird auf vielen Plattformen absichtlich erschwert: versteckte Menüs, „Deaktivieren" statt Löschen, 30-Tage-Fristen und Schuldgefühl-Dialoge („Deine Freunde werden dich vermissen!"). Solche Tricks nennt man Dark Patterns.',
    solution:
      'Bei Klarheit löschst du deinen Account mit einem Klick – sofort wirksam, alle Daten weg, keine Tricks. Wer gehen will, darf gehen. Eine Plattform sollte durch Qualität überzeugen, nicht durch Ausgangssperren.',
  },
  endOfFeed: {
    title: 'Kein Infinite Scroll',
    problem:
      'Infinite Scroll wurde erfunden, damit es keinen natürlichen Stopp-Punkt mehr gibt. Selbst sein Erfinder Aza Raskin bereut die Erfindung heute öffentlich: Ohne Ende fehlt dem Gehirn das Signal „du bist fertig" – man scrollt weiter, obwohl man längst aufhören wollte.',
    solution:
      'Klarheit hat ein ehrliches Ende: Wenn du alle neuen Beiträge gesehen hast, sagen wir es dir. Du bist auf dem neuesten Stand – geh raus, die Sonne scheint vielleicht. ✓',
  },
}
