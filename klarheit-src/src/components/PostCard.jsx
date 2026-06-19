import { useState } from 'react'
import { USERS, CURRENT_USER_ID, formatTime } from '../data.js'
import Avatar from './Avatar.jsx'
import InfoIcon from './InfoIcon.jsx'
import CommentSection from './CommentSection.jsx'

export default function PostCard({ post, liked, onToggleLike, onAddComment }) {
  const [showComments, setShowComments] = useState(false)
  const author = USERS[post.userId]
  const isOwnPost = post.userId === CURRENT_USER_ID

  return (
    <article className="card post">
      <div className="post-head">
        <Avatar user={author} />
        <div className="post-meta">
          <span className="post-author">
            {author.name}
            {isOwnPost && <span className="badge-you">Du</span>}
          </span>
          <span className="post-sub">
            {author.handle} · {formatTime(post.minutesAgo)}
          </span>
        </div>
      </div>

      <p className="post-text">{post.text}</p>

      {post.communityNote && (
        <div className="community-note">
          <div className="community-note-head">
            <span>📝 Nutzer haben Kontext ergänzt</span>
            <InfoIcon topic="communityNotes" />
          </div>
          <p>{post.communityNote}</p>
        </div>
      )}

      <div className="post-actions">
        <button
          className={`action-btn like-btn ${liked ? 'liked' : ''}`}
          onClick={onToggleLike}
          title="Like-Zahlen sind bei Klarheit verborgen: Du kannst zeigen, dass dir etwas gefällt – aber niemand sieht Zahlen bei anderen. Das nimmt den Vergleichsdruck."
        >
          {liked ? '❤️ Gefällt dir' : '🤍 Gefällt mir'}
        </button>
        <InfoIcon topic="hiddenLikes" />

        <button className="action-btn" onClick={() => setShowComments((v) => !v)}>
          💬 {post.comments.length > 0 ? `Kommentare (${post.comments.length})` : 'Kommentieren'}
        </button>

        {isOwnPost && (
          <span
            className="private-likes"
            title="Nur du als Autor siehst diese Zahl – für alle anderen bleibt sie verborgen."
          >
            🔒 Nur für dich: {(post.privateLikes ?? 0) + (liked ? 1 : 0)} Likes
          </span>
        )}
      </div>

      {showComments && (
        <CommentSection comments={post.comments} onAddComment={onAddComment} />
      )}
    </article>
  )
}
