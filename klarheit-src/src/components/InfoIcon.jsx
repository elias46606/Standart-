import { useState } from 'react'
import { INFO_TEXTS } from '../infoTexts.js'

// Kleines ⓘ-Icon: Klick öffnet die Erklärung, welches Problem
// heutiger Plattformen das jeweilige Feature löst.
export default function InfoIcon({ topic }) {
  const [open, setOpen] = useState(false)
  const info = INFO_TEXTS[topic]
  if (!info) return null

  return (
    <>
      <button
        type="button"
        className="info-icon"
        title="Warum gibt es das? Tippe für die Erklärung."
        aria-label={`Erklärung: ${info.title}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        i
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="modal-kicker">💡 Welches Problem löst das?</p>
            <h3>{info.title}</h3>
            <p className="modal-problem">
              <strong>Das Problem heute:</strong> {info.problem}
            </p>
            <p className="modal-solution">
              <strong>Unsere Lösung:</strong> {info.solution}
            </p>
            <button className="btn btn-primary" onClick={() => setOpen(false)}>
              Verstanden
            </button>
          </div>
        </div>
      )}
    </>
  )
}
