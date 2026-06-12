import InfoIcon from './InfoIcon.jsx'

function formatSeconds(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function Header({ seconds, page, onNavigate, theme, onToggleTheme }) {
  return (
    <header className="header">
      <div className="header-inner">
        <button className="logo" onClick={() => onNavigate('feed')}>
          <span className="logo-mark">◎</span> Klarheit
        </button>

        <div className="usage-pill" title="Deine heutige Nutzungszeit – live und ehrlich.">
          <span className="usage-dot" aria-hidden="true" />
          <span className="usage-time">{formatSeconds(seconds)}</span>
          <span className="usage-label">heute</span>
          <InfoIcon topic="usageTime" />
        </div>

        <nav className="nav">
          <button
            className={`nav-btn ${page === 'feed' ? 'active' : ''}`}
            onClick={() => onNavigate('feed')}
          >
            Feed
          </button>
          <button
            className={`nav-btn ${page === 'settings' ? 'active' : ''}`}
            onClick={() => onNavigate('settings')}
          >
            Einstellungen
          </button>
          <button
            className="nav-btn theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Dunklen Modus aktivieren' : 'Hellen Modus aktivieren'}
            aria-label="Farbschema wechseln"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </nav>
      </div>
    </header>
  )
}
