import { useState } from 'react'
import { USERS, CURRENT_USER_ID } from '../data.js'
import Avatar from './Avatar.jsx'

export default function Composer({ onPublish }) {
  const [text, setText] = useState('')
  const currentUser = USERS[CURRENT_USER_ID]

  function handleSubmit(e) {
    e.preventDefault()
    if (text.trim().length === 0) return
    onPublish(text.trim())
    setText('')
  }

  return (
    <form className="card composer" onSubmit={handleSubmit}>
      <div className="composer-row">
        <Avatar user={currentUser} />
        <textarea
          className="composer-input"
          placeholder="Was möchtest du teilen, Alex?"
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="composer-footer">
        <span className="muted small">Kein Algorithmus entscheidet, wer das sieht – alle deine Kontakte sehen es chronologisch.</span>
        <button type="submit" className="btn btn-primary btn-small" disabled={text.trim().length === 0}>
          Veröffentlichen
        </button>
      </div>
    </form>
  )
}
