import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Legend } from './Diagram'

// All explanations live here; pages only show a small «?» that opens their section.
const HELP = {
  data: {
    title: 'Daten & Backup',
    body: (
      <ul>
        <li>Alle Daten liegen nur in diesem Browser auf diesem Gerät. Browserdaten löschen, privates Surfen oder ein anderer Browser bedeuten: Daten weg bzw. nicht sichtbar.</li>
        <li>Darum regelmässig <b>Backup exportieren</b>. Die Datei enthält alle Übungen mit Zeichnungen, Sammlungen und Trainings.</li>
        <li><b>Backup importieren</b> prüft die Datei zuerst. Ist sie fehlerhaft, bleibt alles unverändert. Danach wählen:</li>
        <li><b>Hinzufügen</b>: bestehende Daten bleiben. Gleiche Einträge werden übersprungen; eine Übung oder ein Training, das hier schon existiert aber anders ist, wird als Kopie «(Import)» ergänzt. Gleichnamige Sammlungen (gleiche Herkunft) werden zusammengeführt: fehlende Übungen kommen dazu, nichts wird entfernt. So lassen sich Übungen und Trainings mit anderen Coaches austauschen.</li>
        <li><b>Alles ersetzen</b>: alle aktuellen Daten werden durch die Datei ersetzt; vorher wird ein Export angeboten.</li>
        <li><b>Als App installieren</b> (über die veröffentlichte Webadresse): iPad/iPhone in Safari «Teilen» → «Zum Home-Bildschirm»; Chrome/Edge über das Installieren-Symbol in der Adresszeile. Nach dem ersten Öffnen funktioniert die App auch ohne Internet. Die Daten bleiben pro Gerät; zum Übertragen Backup exportieren und auf dem anderen Gerät «Hinzufügen».</li>
      </ul>
    ),
  },
  library: {
    title: 'Übungen (Bibliothek)',
    body: (
      <ul>
        <li>Es werden 60 Übungen aufs Mal gezeigt; «Mehr anzeigen» oder «Alle anzeigen» blendet weitere ein. Suche und Filter durchsuchen immer alle Übungen.</li>
        <li><b>Neue Übung</b> öffnet den Zeichen-Editor. Fertig ist eine Übung mit Titel, Beschreibung, mindestens einem Coaching-Punkt und einer Erscheinungsform; sonst kann sie als <b>Entwurf</b> gespeichert werden.</li>
        <li>Die Suche durchsucht Titel, Beschreibung, Coaching-Punkte und Autor/in (z. B. «Hockey Canada»). Filter: Erscheinungsform, dann Schlüsselelement (die Liste zeigt nur die Elemente der gewählten Erscheinungsform), Ort (Eis / Off-Ice) und Altersklasse (U10 bis U18+; nicht eingeteilte Übungen erscheinen dann nicht).</li>
        <li><b>Duplizieren</b> erstellt eine Variante; das Original bleibt unverändert.</li>
        <li>Optional pro Übung: Anzahl <b>Spieler/innen</b>, <b>Torhüter/innen</b> und <b>Material</b>. Daraus zeigt jedes Training, was es benötigt.</li>
        <li><b>Löschen</b> entfernt die Übung auch aus eigenen Sammlungen. Bereits geplante Trainings behalten ihre Kopie.</li>
      </ul>
    ),
  },
  editor: {
    title: 'Übung zeichnen',
    body: (
      <ul>
        <li>Links ein Werkzeug wählen. Symbole per Klick auf das Feld setzen oder aus der Liste aufs Feld ziehen.</li>
        <li><b>Schlittschuh-Linien</b> (vorwärts, rückwärts, seitwärts, bremsen) frei zeichnen. Fast gerade Linien werden automatisch begradigt; <b>Cmd/Ctrl+Z</b> zeigt wieder die Freihand-Linie. «Gerade machen» begradigt jederzeit.</li>
        <li><b>Pass</b> und <b>Schuss</b> sind gerade Linien. Im Auswahl-Modus den gestrichelten Punkt ziehen, um sie zu biegen.</li>
        <li><b>Tor</b> und <b>Toblerone</b> drehen: den blauen Punkt ziehen (15°-Schritte) oder die Dreh-Knöpfe. Toblerone: Klick legt sie flach hin, Ziehen von einem Ende richtet sie aus (fix 6 m lang).</li>
        <li><b>Auswählen / verschieben</b>: Elemente ziehen; Linien-Enden an den Punkten verschieben.</li>
        <li>Tastatur (Zeichenfläche fokussiert): Pfeiltasten verschieben (Shift: weiter), Entf löscht, Cmd/Ctrl+D dupliziert, Enter setzt das gewählte Symbol in die Mitte, Escape bricht ab, Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z rückgängig / wiederholen.</li>
        <li>Ungespeicherte Änderungen werden lokal als Entwurf gesichert und nach einem Neuladen wiederhergestellt.</li>
      </ul>
    ),
  },
  collections: {
    title: 'Sammlungen',
    body: (
      <ul>
        <li>Sammlungen sind zugeklappt; ein Klick auf den Namen öffnet sie. Neue, leere Sammlungen sind offen.</li>
        <li><b>Nach Erscheinungsform</b>: automatisch. Eine Übung erscheint dort, sobald sie die Erscheinungsform hat.</li>
        <li><b>Eigene Sammlungen</b>: frei benennen und Übungen von Hand hinzufügen. Eine Übung kann in mehreren Sammlungen sein, ohne kopiert zu werden.</li>
        <li>Eine ganze Sammlung kann in ein Training übernommen werden.</li>
      </ul>
    ),
  },
  sessions: {
    title: 'Trainings',
    body: (
      <ul>
        <li>Trainings sind nach Monat geordnet; vergangene Monate sind zugeklappt. Die Suche durchsucht Titel, Notizen und die enthaltenen Übungen; Filter nach Erscheinungsform und Schlüsselelement.</li>
        <li>Status: <span className="status-badge draft">✎ Entwurf</span> = geplant, noch offen; <span className="status-badge final">✓ Definitiv</span> = festgelegt; <span className="status-badge template">▤ Vorlage</span> = Vorlage. Umschalten im Training.</li>
        <li><b>Vorlagen</b>: ein Training mit «Vorlage» markieren (z. B. typischer Ablauf Einwärmen → Posten → Spielform). Vorlagen stehen oben in eigenem Ordner und zählen nicht in der Auswertung. «Neues Training aus…» erstellt aus einer Vorlage oder einem früheren Training ein neues Training ohne Datum, als Entwurf. Mit «Ersetzen» lässt sich pro Eintrag eine andere Übung einsetzen; Dauer und Notizen bleiben.</li>
        <li><b>+ Übungen hinzufügen</b> öffnet Vorschläge: zuerst wählen, was trainiert werden soll (Erscheinungsform, optional ein Schlüsselelement), dann mit Altersklasse, Ort oder Stichwort eingrenzen. Eigene, fertige Übungen und solche mit diesem Hauptfokus stehen zuoberst. Mehrere Übungen nacheinander hinzufügen, dann «Fertig». <b>Ersetzen</b> öffnet dieselben Vorschläge, schon auf die Erscheinungsform der bisherigen Übung eingestellt.</li>
        <li><b>Start</b> (Uhrzeit) eintragen: jeder Eintrag zeigt dann seine Zeit, z. B. 17:07–17:47, auch auf dem Trainingsblatt.</li>
        <li><b>Posten-Block</b>: «Parallel (Posten)» bei einem Eintrag setzen, er gehört dann zum selben Block wie der vorherige. Die Gruppen rotieren durch alle Posten, darum zählt jeder Posten mit seiner vollen Dauer: 3 Posten à 12 Min. = 36 Min., also die Zeit, die jede Spielerin und jeder Spieler an jeder Übung verbringt. Auf dem Trainingsblatt stehen die Posten nebeneinander.</li>
        <li><b>Wechselzeit</b>: zwischen zwei Übungen bzw. Blöcken werden automatisch 2 Min. eingerechnet (in Zeiten und Total). Der Wechsel zwischen den Posten innerhalb eines Blocks zählt nicht extra.</li>
        <li><b>Anwesenheit (AWK)</b>: im Training «Anwesenheit erfassen» und abwesende Spieler/innen abwählen. Das Trainingsblatt zeigt die anwesenden Spieler/innen nach Gruppen (ohne Erfassung das ganze Team).</li>
        <li><b>Benötigt</b>: aus den Angaben der Übungen (Spieler/innen, Torhüter/innen, Material). Posten im selben Block laufen gleichzeitig und werden zusammengezählt; massgebend ist der Block mit dem grössten Bedarf.</li>
        <li><b>Bearbeiten</b> bei einem Eintrag öffnet die Übung im Editor. Speichern legt sie als neue <b>Variante</b> in der Bibliothek an (Titel mit «(Variante)», falls nicht umbenannt) und setzt sie in diesem Eintrag ein. Die Original-Übung und andere Trainings bleiben unverändert. Schliessen ohne Speichern ändert nichts.</li>
        <li><b>Notizen zum Training</b> gelten für das ganze Training (z. B. Schwerpunkte, Key-Points Coach), erscheinen auf dem Trainingsblatt und werden durchsucht. Pro Übung gibt es zusätzlich eigene Notizen.</li>
        <li>Übungen werden als <b>Kopie</b> eingeplant: spätere Änderungen in der Bibliothek ändern ein Training nicht. Dieselbe Übung darf mehrmals vorkommen.</li>
        <li>Reihenfolge: am Griff ⠿ ziehen oder «Nach oben / Nach unten». Eine ungültige Dauer wird nicht übernommen.</li>
        <li><b>Drucken / PDF</b> erstellt ein Trainingsblatt mit Diagrammen (im Druckdialog «Als PDF sichern»).</li>
        <li><b>Kalender (.ics)</b> lädt alle Trainings und Spiele mit Datum als Kalenderdatei herunter (Apple, Google, Outlook). Mit Startzeit als Termin mit Dauer, sonst ganztägig; Entwürfe erscheinen als «vorläufig». Erneut importieren aktualisiert die Termine statt sie zu verdoppeln (je nach Kalender-App).</li>
      </ul>
    ),
  },
  dashboard: {
    title: 'Auswertung',
    body: (
      <ul>
        <li>Oben die Abfrage wählen: <b>Bericht</b>, <b>Gruppierung</b> (Gesamt, pro Woche nach ISO-Kalenderwoche, pro Monat), <b>Status</b> (definitiv, geplant oder beides) und optional einen Zeitraum <b>Von / Bis</b>.</li>
        <li><b>Trainings</b>: Anzahl Trainings und Minuten pro Zeitraum, getrennt nach definitiv und geplant (Entwurf).</li>
        <li><b>Minuten pro Erscheinungsform</b>: alle Erscheinungsformen (die acht aus dem U12-Plan und die der Torhüter/innen) mit Minuten pro Zeitraum (dunkler = mehr) und Total. Hat eine Übung mehrere Erscheinungsformen, werden ihre Minuten gleichmässig aufgeteilt, damit die Summe der Trainingszeit entspricht. Übungen ohne Erscheinungsform erscheinen als «Ohne Erscheinungsform».</li>
        <li>Minuten sind die Dauern der Übungen im Training. Trainings ohne Datum werden nicht gezählt.</li>
      </ul>
    ),
  },
  season: {
    title: 'Saisonplan',
    body: (
      <ul>
        <li>Ein Saisonplan hat dieselben Wochen wie der SIHF-Ausbildungsplan: 10 Wochen Off-Ice Saison und 29 Wochen Eissaison, mit Sommer- und Weihnachtspause. <b>Neuer Plan</b> erstellt diese Wochen leer; <b>SIHF-Beispiel übernehmen</b> erstellt den kompletten Beispielplan als Ausgangspunkt.</li>
        <li>Pro Woche planen: Monat, Spezial (z. B. Elterninfo, Trainingslager), die geplanten <b>Trainings</b> mit ihren Ziel-Schlüsselelementen, das begleitende Off-Ice-Ziel, das Persönlichkeitsziel, Notizen und eine Pause danach.</li>
        <li><b>Wochenbeginn</b> setzen verbindet die Woche mit dem Kalender. «Folgende Wochen datieren» setzt die restlichen Wochen der Phase im Wochenabstand; nach einer Pause die erste Woche neu setzen und erneut datieren.</li>
        <li><b>Ist</b>: datierte Wochen zeigen die Trainings dieser Woche. Bei jedem geplanten Ziel steht ✓, wenn eine Übung in diesen Trainings das Schlüsselelement hat, sonst ○. «Training anlegen» erstellt ein Training in dieser Woche mit den Zielen in den Notizen.</li>
      </ul>
    ),
  },
  games: {
    title: 'Spiele',
    body: (
      <ul>
        <li>«Neues Spiel» erfassen: Gegner, Heim oder Auswärts, Datum und Startzeit.</li>
        <li><b>Aufstellung</b>: 4 Sturmlinien (LW, C, RW), 3 Verteidigungspaare (LD, RD) und 2 Torhüter/innen. In jeder Auswahl stehen die passenden Positionen zuoberst; wer schon eingeteilt ist, ist markiert und wechselt beim Auswählen den Platz. Darunter steht, wer noch nicht eingeteilt ist.</li>
        <li><b>Übernehmen von…</b> kopiert die Aufstellung eines anderen Spiels, z. B. die Standard-Aufstellung, und lässt sich danach anpassen.</li>
        <li><b>Drucken / PDF</b> erstellt ein Spielblatt mit der Aufstellung und den Notizen.</li>
        <li>Spiele zählen nicht in der Auswertung der Trainings und nicht im Saisonplan. Mit «Kalender (.ics)» kommen sie mit 2 Stunden Dauer in den Kalender.</li>
        <li>Wird eine Spielerin oder ein Spieler aus dem Team entfernt, verschwindet sie oder er auch aus allen Aufstellungen.</li>
      </ul>
    ),
  },
  team: {
    title: 'Team',
    body: (
      <ul>
        <li>Das Team startet mit 20 Platzhaltern (2 Torhüter/innen, 6 Verteidiger/innen, 12 Stürmer/innen) in den Gruppen Blau und Weiss. Namen, Nummern, Positionen und Gruppen direkt in der Tabelle ändern.</li>
        <li>Gruppen sind frei benennbar (z. B. für Posten oder Blau/Weiss) und erscheinen auf dem Trainingsblatt.</li>
        <li>«Anwesend» zählt, in wie vielen Trainings mit erfasster Anwesenheit die Person dabei war.</li>
      </ul>
    ),
  },
  board: {
    title: 'Taktiktafel',
    body: (
      <ul>
        <li>Freie Tafel zum schnellen Aufzeichnen, z. B. im Timeout oder bei einer Besprechung. Sie ist unabhängig von den Übungen und nicht Teil des Backups; der Inhalt bleibt aber nach einem Neuladen erhalten.</li>
        <li>Mit Finger, Apple Pencil oder Maus zeichnen; Farbe Schwarz, Rot oder Blau wählen. Ein Tipp setzt einen Punkt.</li>
        <li><b>Radierer</b>: über Striche wischen, um sie zu entfernen. <b>Alles löschen</b> lässt sich mit «Rückgängig» zurückholen.</li>
        <li>Mit dem Apple Pencil: sobald der Stift benutzt wurde, zeichnen Finger nicht mehr (Handballen darf aufliegen).</li>
        <li><b>Vollbild</b>: die Tafel deckt den ganzen Bildschirm ab, nur eine Werkzeugleiste bleibt; am besten das iPad quer halten. «Vollbild beenden» führt zurück. Als App installiert (siehe Daten & Backup) verschwinden auch die Browserleisten ganz.</li>
      </ul>
    ),
  },
  symbols: { title: 'Symbole', body: <Legend /> },
} satisfies Record<string, { title: string; body: ReactNode }>

export type HelpTopic = keyof typeof HELP

const HelpSection = ({ topic }: { topic: HelpTopic }) => (
  <section className="help-section">
    <h3>{HELP[topic].title}</h3>
    {HELP[topic].body}
  </section>
)

export function Help() {
  return (
    <section>
      <h2>Hilfe</h2>
      {(Object.keys(HELP) as HelpTopic[]).map((t) => <HelpSection key={t} topic={t} />)}
    </section>
  )
}

export function HelpButton({ topic }: { topic: HelpTopic }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button type="button" className="help-button" aria-label={`Hilfe: ${HELP[topic].title}`} onClick={() => dialog.current?.showModal()}>?</button>
      <dialog ref={dialog} className="help-dialog" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <HelpSection topic={topic} />
        <form method="dialog"><button>Schliessen</button></form>
      </dialog>
    </>
  )
}
