import { Link } from 'react-router-dom'

export default function Button({ to, variant = 'primary', className = '', children, type = 'button', ...props }) {
  const classes = `button button--${variant} ${className}`.trim()
  return to ? (
    <Link className={classes} to={to} {...props}>{children}</Link>
  ) : (
    <button className={classes} type={type} {...props}>{children}</button>
  )
}
