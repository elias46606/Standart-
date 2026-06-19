import InfoIcon from './InfoIcon.jsx'

export default function PauseReminder({ minutes, onDismiss }) {
  return (
    <div className="modal-overlay">
      <div className="modal pause-modal" role="dialog" aria-modal="true">
        <div className="pause-emoji" aria-hidden="true">🌿</div>
        <h3>
          Zeit für eine kleine Pause? <InfoIcon topic="usageTime" />
        </h3>
        <p>
          Du bist jetzt seit <strong>{minutes} Minuten</strong> hier. Wie wäre es mit einem
          Glas Wasser, einem Blick aus dem Fenster oder ein paar Schritten?
        </p>
        <p className="muted small">
          Klarheit will deine Zeit nicht festhalten. (Für die Demo ist diese Erinnerung auf
          2 Minuten verkürzt.)
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onDismiss}>
            Danke für den Hinweis 💚
          </button>
        </div>
      </div>
    </div>
  )
}
