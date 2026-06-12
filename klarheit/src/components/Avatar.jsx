export default function Avatar({ user, size = 44 }) {
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)

  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: user.color,
        fontSize: size * 0.38,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}
