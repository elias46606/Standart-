import { useEffect, useState } from 'react'
import { USERS, CURRENT_USER_ID } from '../data.js'
import Avatar from './Avatar.jsx'
import InfoIcon from './InfoIcon.jsx'

const THINK_SECONDS = 10

export default function CommentSection({ comments, onAddComment }) {
  const [text, setText] = useState('')
  const [countdown, setCountdown] = useState(null) // null = noch nicht gestartet

  // Bedenkzeit startet, sobald getippt wird.
  useEffect(() => {
    if (text.length > 0 && countdown === null) {
      setCountdown(THINK_SECONDS)
    }
  }, [text, countdown])

  useEffect(() => {
    if (countdown === null || countdown === 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const ready = countdown === 0
  const canSubmit = ready && text.trim().length > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onAddComment(text.trim())
    setText('')
    setCountdown(null)
  }

  return (
    <div className="comment-section">
      {comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((comment) => {
            const author = USERS[comment.userId]
            return (
              <li key={comment.id} className="comment">
                <Avatar user={author} size={28} />
                <div>
                  <span className="comment-author">
                    {author.id === CURRENT_USER_ID ? 'Du' : author.name}
                  </span>
                  <p className="comment-text">{comment.text}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form className="comment-form" onSubmit={handleSubmit}>
        <textarea
          className="comment-input"
          placeholder="Was möchtest du dazu sagen?"
          value={text}
          rows={2}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="comment-form-footer">
          {countdown !== null && !ready ? (
            <span className="think-hint">
              🧘 Kurz nachdenken … <strong>{countdown} s</strong>
              <span className="think-bar">
                <span
                  className="think-bar-fill"
                  style={{ width: `${((THINK_SECONDS - countdown) / THINK_SECONDS) * 100}%` }}
                />
              </span>
            </span>
          ) : (
            <span className="think-hint muted">
              {ready ? '✓ Bedenkzeit vorbei – bereit zum Absenden' : 'Beim Tippen startet eine kurze Bedenkzeit'}
            </span>
          )}
          <span className="comment-submit-row">
            <InfoIcon topic="commentDelay" />
            <button type="submit" className="btn btn-primary btn-small" disabled={!canSubmit}>
              {countdown !== null && !ready ? `Noch ${countdown} s` : 'Absenden'}
            </button>
          </span>
        </div>
      </form>
    </div>
  )
}
