import { useState } from 'react'
import { USERS, CURRENT_USER_ID } from '../data.js'
import Avatar from './Avatar.jsx'
import InfoIcon from './InfoIcon.jsx'

export default function SettingsPage({ theme, onToggleTheme, onExportData, onDeleteAccount }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const currentUser = USERS[CURRENT_USER_ID]

  return (
    <div className="feed settings">
      <div className="card settings-profile">
        <Avatar user={currentUser} size={56} />
        <div>
          <h2>{currentUser.name}</h2>
          <p className="muted">{currentUser.handle} · Mitglied seit März 2026</p>
        </div>
      </div>

      <section className="card">
        <h3>Erscheinungsbild</h3>
        <div className="settings-row">
          <div>
            <strong>Farbschema</strong>
            <p className="muted small">Heller oder dunkler Modus – ganz wie du magst.</p>
          </div>
          <button className="btn" onClick={onToggleTheme}>
            {theme === 'light' ? '🌙 Dunkler Modus' : '☀️ Heller Modus'}
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Deine Daten gehören dir</h3>

        <div className="settings-row">
          <div>
            <strong>
              Meine Daten exportieren <InfoIcon topic="dataExport" />
            </strong>
            <p className="muted small">
              Lädt sofort alle deine Daten (Profil, Beiträge, Kommentare, Likes) als
              JSON-Datei herunter.
            </p>
          </div>
          <button className="btn" onClick={onExportData}>
            ⬇️ Exportieren
          </button>
        </div>

        <div className="settings-row">
          <div>
            <strong>
              Account löschen <InfoIcon topic="accountDelete" />
            </strong>
            <p className="muted small">
              Sofort wirksam, keine Wartefrist, keine versteckten Hürden.
            </p>
          </div>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            🗑️ Löschen
          </button>
        </div>
      </section>

      <section className="card about">
        <h3>Wofür Klarheit steht</h3>
        <ul className="principles">
          <li>⏳ Deine Zeit gehört dir – kein Suchtdesign, keine endlosen Feeds.</li>
          <li>💚 Mentale Gesundheit vor Engagement – keine öffentlichen Vergleichszahlen.</li>
          <li>🔍 Transparenz statt Algorithmus – du siehst, warum du etwas siehst.</li>
          <li>🔐 Keine Werbung, keine Tracker – deine Daten werden nicht verkauft.</li>
        </ul>
      </section>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Account wirklich löschen?</h3>
            <p>
              Dein Account und alle Daten werden <strong>sofort und endgültig</strong>{' '}
              gelöscht. Kein „Deaktivieren", keine 30-Tage-Frist, keine Schuldgefühl-Tricks.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </button>
              <button className="btn btn-danger" onClick={onDeleteAccount}>
                Ja, endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
