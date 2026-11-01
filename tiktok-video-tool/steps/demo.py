"""Beispiel-Inhalte für den Testmodus (--demo).

Damit lässt sich die komplette Pipeline ohne Claude-API-Key ausprobieren.
Das Skript ist fest vorgegeben (Thema: Weimarer Republik), egal welches Thema
eingegeben wurde.
"""

SCRIPT = """\
Eine Demokratie, die nur 14 Jahre überlebt hat. Warum ist die Weimarer Republik gescheitert?

1919 startet Deutschland als Republik, aber mit einem schweren Rucksack. Der verlorene Erste Weltkrieg, der Versailler Vertrag und riesige Reparationen. Viele Deutsche glauben an die Dolchstoßlegende: Die Armee sei unbesiegt gewesen und von Politikern verraten worden. Die junge Demokratie gilt von Anfang an als Verliererin.

Dann kommt das Geld ins Wanken. 1923 kostet ein Brot plötzlich Milliarden Mark. Ersparnisse von Jahrzehnten sind über Nacht wertlos. Wer alles verloren hat, verliert auch das Vertrauen in den Staat.

Nach ein paar ruhigeren Jahren trifft die Weltwirtschaftskrise Deutschland mit voller Wucht. Sechs Millionen Arbeitslose. Radikale Parteien von links und rechts bekommen massiv Zulauf und kämpfen auf der Straße.

Dazu kommt ein Konstruktionsfehler in der Verfassung. Mit Artikel 48 kann der Reichspräsident per Notverordnung regieren, am Parlament vorbei. Genau das passiert ab 1930 immer öfter.

Und am Ende? Konservative Eliten glauben, sie könnten Hitler kontrollieren, und machen ihn im Januar 1933 zum Reichskanzler. Ein fataler Irrtum.

Die Weimarer Republik scheiterte also nicht an einem einzigen Fehler, sondern an zu vielen Krisen gleichzeitig und an zu wenigen überzeugten Demokraten.

Was glaubst du: Welcher Grund war der wichtigste? Schreib es in die Kommentare!
"""

# Werden der Reihe nach auf die Szenen verteilt (Pexels-Suchbegriffe auf Englisch)
IMAGE_HINTS = [
    ("Alter Reichstag in Berlin im Nebel, dramatisches Licht", "reichstag berlin"),
    ("Historisches Dokument mit Siegel auf einem Holztisch", "old document seal"),
    ("Soldaten-Helm auf einem Feld bei Sonnenuntergang", "old military helmet"),
    ("Stapel alter Geldscheine, Inflation", "old banknotes"),
    ("Leere Brieftasche in Händen, Sorgen", "empty wallet"),
    ("Menschenschlange vor einem Gebäude in Schwarzweiß", "crowd black and white"),
    ("Demonstration mit Fahnen auf einer Straße", "protest crowd street"),
    ("Aufgeschlagenes Gesetzbuch mit Paragrafen", "law book"),
    ("Schachbrett mit umgefallenem König", "chess king fallen"),
    ("Dunkle Wolken über einer Stadt", "storm clouds city"),
    ("Zerbrochene Glasscheibe, Symbol für Scheitern", "broken glass"),
    ("Junge Person schaut nachdenklich in die Kamera", "thoughtful person"),
]

CAPTION = (
    "Warum ist die Weimarer Republik gescheitert? Inflation, Wirtschaftskrise, "
    "Artikel 48 – die Gründe in 70 Sekunden."
)
HASHTAGS = ["#geschichte", "#weimarerrepublik", "#lernenmittiktok", "#history"]
