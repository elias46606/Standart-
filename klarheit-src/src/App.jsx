import { useEffect, useRef, useState } from 'react'
import { POSTS, USERS, CURRENT_USER_ID } from './data.js'
import Header from './components/Header.jsx'
import Feed from './components/Feed.jsx'
import SettingsPage from './components/SettingsPage.jsx'
import PauseReminder from './components/PauseReminder.jsx'

// Für die Demo verkürzt: Pause-Erinnerung nach 2 Minuten.
const PAUSE_AFTER_SECONDS = 120

export default function App() {
  const [page, setPage] = useState('feed')
  const [theme, setTheme] = useState(() => localStorage.getItem('klarheit-theme') || 'light')
  const [posts, setPosts] = useState(POSTS)
  const [likedPosts, setLikedPosts] = useState(() => new Set())
  const [seconds, setSeconds] = useState(0)
  const [showPause, setShowPause] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const nextReminderAt = useRef(PAUSE_AFTER_SECONDS)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('klarheit-theme', theme)
  }, [theme])

  // Nutzungszeit zählt live hoch.
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1
        if (next >= nextReminderAt.current) {
          nextReminderAt.current += PAUSE_AFTER_SECONDS
          setShowPause(true)
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  function toggleLike(postId) {
    setLikedPosts((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  function addComment(postId, text) {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [
                ...post.comments,
                { id: `c-neu-${Date.now()}`, userId: CURRENT_USER_ID, text },
              ],
            }
          : post,
      ),
    )
  }

  function publishPost(text) {
    setPosts((prev) => [
      {
        id: `p-neu-${Date.now()}`,
        userId: CURRENT_USER_ID,
        minutesAgo: 0,
        text,
        privateLikes: 0,
        comments: [],
      },
      ...prev,
    ])
    setPage('feed')
  }

  function exportData() {
    const me = USERS[CURRENT_USER_ID]
    const data = {
      exportiertAm: new Date().toISOString(),
      hinweis: 'Vollständiger Datenexport gemäß DSGVO Art. 20 – deine Daten gehören dir.',
      profil: { name: me.name, handle: me.handle },
      eigeneBeitraege: posts
        .filter((p) => p.userId === CURRENT_USER_ID)
        .map((p) => ({ text: p.text, likes: p.privateLikes ?? 0 })),
      eigeneKommentare: posts.flatMap((p) =>
        p.comments
          .filter((c) => c.userId === CURRENT_USER_ID)
          .map((c) => ({ zuBeitragVon: USERS[p.userId].name, text: c.text })),
      ),
      gelikteBeitraege: [...likedPosts].map((id) => {
        const p = posts.find((post) => post.id === id)
        return p ? { von: USERS[p.userId].name, text: p.text } : null
      }).filter(Boolean),
      einstellungen: { farbschema: theme },
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'klarheit-datenexport.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (deleted) {
    return (
      <div className="deleted-screen">
        <div className="card deleted-card">
          <div className="end-check">✓</div>
          <h2>Dein Account wurde gelöscht.</h2>
          <p className="muted">
            Sofort und endgültig – alle Daten sind weg. Keine Wartefrist, kein
            „Wir vermissen dich"-Newsletter. Mach's gut! 👋
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Demo neu starten
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        seconds={seconds}
        page={page}
        onNavigate={setPage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      />

      <main className="container">
        {page === 'feed' ? (
          <Feed
            posts={posts}
            likedPosts={likedPosts}
            onToggleLike={toggleLike}
            onAddComment={addComment}
            onPublish={publishPost}
          />
        ) : (
          <SettingsPage
            theme={theme}
            onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            onExportData={exportData}
            onDeleteAccount={() => setDeleted(true)}
          />
        )}
      </main>

      <footer className="footer">
        <p className="muted small">
          Klarheit – eine Demo für soziale Medien ohne Suchtfaktor · Keine Werbung, keine
          Tracker, kein Algorithmus
        </p>
      </footer>

      {showPause && (
        <PauseReminder
          minutes={Math.max(1, Math.round(seconds / 60))}
          onDismiss={() => setShowPause(false)}
        />
      )}
    </div>
  )
}
