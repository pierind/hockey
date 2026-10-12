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
        <li><b>Backup importieren</b> prüft die Datei zuerst. Ist sie fehlerhaft, bleibt alles unverändert. Eine gültige Datei <b>ersetzt alle aktuellen Daten</b>; vorher wird ein Export angeboten.</li>
      </ul>
    ),
  },
  library: {
    title: 'Übungen (Bibliothek)',
    body: (
      <ul>
        <li><b>Neue Übung</b> öffnet den Zeichen-Editor. Fertig ist eine Übung mit Titel, Beschreibung, mindestens einem Coaching-Punkt und einer Erscheinungsform; sonst kann sie als <b>Entwurf</b> gespeichert werden.</li>
        <li>Die Suche durchsucht Titel, Beschreibung und Coaching-Punkte. Filter: Erscheinungsform, dann Schlüsselelement (die Liste zeigt nur die Elemente der gewählten Erscheinungsform), und Ort (Eis / Off-Ice).</li>
        <li><b>Duplizieren</b> erstellt eine Variante; das Original bleibt unverändert.</li>
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
        <li>Status: <span className="status-badge draft">✎ Entwurf</span> = geplant, noch offen; <span className="status-badge final">✓ Definitiv</span> = festgelegt. Umschalten im Training.</li>
        <li>Übungen werden als <b>Kopie</b> eingeplant: spätere Änderungen in der Bibliothek ändern ein Training nicht. Dieselbe Übung darf mehrmals vorkommen.</li>
        <li>Reihenfolge: am Griff ⠿ ziehen oder «Nach oben / Nach unten». Eine ungültige Dauer wird nicht übernommen.</li>
        <li><b>Drucken / PDF</b> erstellt ein Trainingsblatt mit Diagrammen und Legende (im Druckdialog «Als PDF sichern»).</li>
      </ul>
    ),
  },
  dashboard: {
    title: 'Auswertung',
    body: (
      <ul>
        <li>Oben die Abfrage wählen: <b>Bericht</b>, <b>Gruppierung</b> (Gesamt, pro Woche nach ISO-Kalenderwoche, pro Monat), <b>Status</b> (definitiv, geplant oder beides) und optional einen Zeitraum <b>Von / Bis</b>.</li>
        <li><b>Trainings</b>: Anzahl Trainings und Minuten pro Zeitraum, getrennt nach definitiv und geplant (Entwurf).</li>
        <li><b>Minuten pro Erscheinungsform</b>: alle neun Erscheinungsformen mit Minuten pro Zeitraum (dunkler = mehr) und Total. Hat eine Übung mehrere Erscheinungsformen, werden ihre Minuten gleichmässig aufgeteilt, damit die Summe der Trainingszeit entspricht. Übungen ohne Erscheinungsform erscheinen als «Ohne Erscheinungsform».</li>
        <li>Minuten sind die Dauern der Übungen im Training. Trainings ohne Datum werden nicht gezählt.</li>
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
