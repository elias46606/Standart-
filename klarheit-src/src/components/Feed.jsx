import InfoIcon from './InfoIcon.jsx'
import Composer from './Composer.jsx'
import PostCard from './PostCard.jsx'

export default function Feed({ posts, likedPosts, onToggleLike, onAddComment, onPublish }) {
  return (
    <div className="feed">
      <div className="feed-intro card">
        <div>
          <h2>Dein Feed – streng chronologisch</h2>
          <p className="muted">
            Neueste Beiträge zuerst. Kein Algorithmus, keine Werbung, kein endloses Scrollen.
          </p>
        </div>
        <InfoIcon topic="chronoFeed" />
      </div>

      <Composer onPublish={onPublish} />

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          liked={likedPosts.has(post.id)}
          onToggleLike={() => onToggleLike(post.id)}
          onAddComment={(text) => onAddComment(post.id, text)}
        />
      ))}

      <div className="end-of-feed">
        <div className="end-check">✓</div>
        <h3>Du bist auf dem neuesten Stand</h3>
        <p className="muted">
          Das war alles seit deinem letzten Besuch. Hier kommt nichts mehr – versprochen.
        </p>
        <InfoIcon topic="endOfFeed" />
      </div>
    </div>
  )
}
