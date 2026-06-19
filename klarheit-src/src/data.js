// Demo-Daten für Klarheit – alles fest im Code, kein Backend nötig.

export const CURRENT_USER_ID = 'u1'

export const USERS = {
  u1: { id: 'u1', name: 'Alex Berger', handle: '@alex', color: '#6366f1' },
  u2: { id: 'u2', name: 'Miriam Schneider', handle: '@miriam', color: '#ec4899' },
  u3: { id: 'u3', name: 'Jonas Weber', handle: '@jonas', color: '#f59e0b' },
  u4: { id: 'u4', name: 'Leyla Aydın', handle: '@leyla', color: '#10b981' },
  u5: { id: 'u5', name: 'Tom Krüger', handle: '@tom', color: '#3b82f6' },
  u6: { id: 'u6', name: 'Sofia Romano', handle: '@sofia', color: '#ef4444' },
}

// Posts sind streng chronologisch sortiert (neueste zuerst).
// minutesAgo = wie lange der Post zurückliegt.
export const POSTS = [
  {
    id: 'p1',
    userId: 'u2',
    minutesAgo: 8,
    text: 'Heute Morgen auf dem Wochenmarkt gewesen: frische Erdbeeren, ein Sauerteigbrot und ein kurzer Plausch mit der Gemüsehändlerin. Manchmal sind es die kleinen Dinge, die den Tag gut starten lassen. 🍓',
    comments: [
      { id: 'c1', userId: 'u4', text: 'Welcher Markt war das? Ich suche noch einen guten in der Nähe!' },
    ],
  },
  {
    id: 'p2',
    userId: 'u3',
    minutesAgo: 25,
    text: 'Die Bahn hatte heute nur 4 Minuten Verspätung. Ich weiß ehrlich gesagt nicht, wie ich mit so viel Pünktlichkeit umgehen soll. Musste am Gleis erstmal tief durchatmen. 🚆😄',
    comments: [
      { id: 'c2', userId: 'u5', text: 'Screenshot machen und einrahmen!' },
      { id: 'c3', userId: 'u2', text: 'Bei mir waren es heute 25 Minuten. Ich nehme deine 4 gerne.' },
    ],
  },
  {
    id: 'p3',
    userId: 'u4',
    minutesAgo: 47,
    text: 'Dritter Versuch, endlich geschafft: Mein Sauerteigbrot ist nicht mehr innen klitschig und außen verbrannt, sondern einfach … gut?! Falls jemand das Rezept möchte, schreibt mir einen Kommentar. 🍞',
    comments: [
      { id: 'c4', userId: 'u1', text: 'Rezept bitte! Mein letzter Versuch war eher ein Ziegelstein.' },
    ],
  },
  {
    id: 'p4',
    userId: 'u1',
    minutesAgo: 65,
    text: 'Habe heute zum ersten Mal seit Monaten meinen Schreibtisch komplett aufgeräumt. Gefunden: drei Ladekabel, eine verschollene Bibliothekskarte und erstaunlich viel Motivation. Kann ich empfehlen.',
    privateLikes: 7,
    comments: [],
  },
  {
    id: 'p5',
    userId: 'u5',
    minutesAgo: 90,
    text: 'Wusstet ihr, dass Spinat extrem viel Eisen enthält? Deshalb war Popeye so stark. Esst mehr Spinat, Leute! 💪🥬',
    communityNote:
      'Der angeblich besonders hohe Eisengehalt von Spinat geht auf einen über 100 Jahre alten Übertragungsfehler zurück. Frischer Spinat enthält etwa 2,7 mg Eisen pro 100 g – ähnlich viel wie andere grüne Gemüse. Spinat ist trotzdem gesund. (Quelle: Verbraucherzentrale)',
    comments: [
      { id: 'c5', userId: 'u6', text: 'Den Mythos kannte ich auch noch aus der Schule!' },
    ],
  },
  {
    id: 'p6',
    userId: 'u6',
    minutesAgo: 130,
    text: 'Meine Balkon-Tomaten haben die ersten Blüten! 🍅 Letztes Jahr habe ich genau drei Tomaten geerntet, dieses Jahr peile ich mutig fünf an. Man muss sich ja realistische Ziele setzen.',
    comments: [],
  },
  {
    id: 'p7',
    userId: 'u3',
    minutesAgo: 180,
    text: 'Buchtipp für alle, die etwas zum Abschalten suchen: „Der Gesang der Flusskrebse". Habe es gestern Abend angefangen und prompt bis 1 Uhr gelesen. Heute bereue ich nichts – außer den Wecker.',
    comments: [
      { id: 'c6', userId: 'u2', text: 'Liegt schon ewig auf meinem Stapel. Dann jetzt wohl wirklich.' },
    ],
  },
  {
    id: 'p8',
    userId: 'u2',
    minutesAgo: 240,
    text: 'Heute die ersten 5 Kilometer am Stück gelaufen, ohne Pause! 🏃‍♀️ Vor zwei Monaten war nach 500 Metern Schluss. Falls ihr also gerade mit etwas anfangt und es zäh ist: dranbleiben lohnt sich.',
    comments: [
      { id: 'c7', userId: 'u4', text: 'Stark! Welche App nutzt du fürs Training?' },
      { id: 'c8', userId: 'u2', text: 'Gar keine – nur Stoppuhr und eine gute Playlist. 😊' },
    ],
  },
  {
    id: 'p9',
    userId: 'u4',
    minutesAgo: 310,
    text: 'Flohmarkt-Fund des Tages: eine alte Schreibmaschine für 12 Euro. Funktioniert noch! Jetzt brauche ich nur noch einen Grund, jemandem einen getippten Brief zu schicken. Freiwillige vor. ✉️',
    comments: [],
  },
  {
    id: 'p10',
    userId: 'u5',
    minutesAgo: 370,
    text: 'Unpopuläre Meinung: Kaffee aus der French Press schlägt jeden Vollautomaten. Vier Minuten Wartezeit am Morgen sind keine verlorene Zeit, sondern Meditation mit Belohnung. ☕',
    comments: [
      { id: 'c9', userId: 'u1', text: 'Bei mir scheitert es immer am Reinigen danach …' },
    ],
  },
  {
    id: 'p11',
    userId: 'u1',
    minutesAgo: 430,
    text: 'Nach drei Jahren endlich das quietschende Fahrrad zur Werkstatt gebracht. Der Mechaniker hat nur genickt und gesagt: „Das kenne ich." Morgen fahre ich zum ersten Mal wieder lautlos zur Arbeit. 🚲',
    privateLikes: 4,
    comments: [],
  },
  {
    id: 'p12',
    userId: 'u6',
    minutesAgo: 540,
    text: 'Spieleabend gestern: Bei „Wizard" hat Oma uns alle vernichtend geschlagen – zum dritten Mal in Folge. Wir vermuten Kartenzählen, sie sagt „Lebenserfahrung". 🃏',
    comments: [
      { id: 'c10', userId: 'u3', text: 'Omas bluffen einfach besser. Wissenschaftlich erwiesen (von mir).' },
    ],
  },
  {
    id: 'p13',
    userId: 'u3',
    minutesAgo: 660,
    text: 'Regentag-Programm: Hörbuch an, Tee gekocht, und der Stapel Bügelwäsche hat sich fast von selbst erledigt. Fast. Welche Hörbücher könnt ihr für Hausarbeit empfehlen?',
    comments: [],
  },
  {
    id: 'p14',
    userId: 'u2',
    minutesAgo: 780,
    text: 'Gestern spontan ins Naturkundemuseum gegangen. Stand 20 Minuten vor dem Dinosaurier-Skelett und habe mich gefühlt wie mit acht Jahren. Manche Dinge werden einfach nie langweilig. 🦕',
    comments: [
      { id: 'c11', userId: 'u6', text: 'Der Saurier-Saal ist und bleibt das Beste!' },
    ],
  },
  {
    id: 'p15',
    userId: 'u4',
    minutesAgo: 900,
    text: 'Plant jemand am Wochenende eine Wanderung? Ich würde gern die Tour am Schliffkopf machen – etwa 12 km, mit Einkehr natürlich. Bei Interesse einfach kommentieren! 🥾',
    comments: [
      { id: 'c12', userId: 'u5', text: 'Bin dabei, wenn das Wetter hält!' },
    ],
  },
]

export function formatTime(minutesAgo) {
  if (minutesAgo < 1) return 'gerade eben'
  if (minutesAgo < 60) return `vor ${minutesAgo} Min.`
  const hours = Math.round(minutesAgo / 60)
  return `vor ${hours} Std.`
}
