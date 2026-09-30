import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { useReducedMotion, useHighContrast, useColorScheme } from '../utils/accessibility'

// Breakpoint context
const BreakpointContext = createContext('lg')

export function BreakpointProvider({ children }) {
  const [breakpoint, setBreakpoint] = useState('lg')

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth
      if (width < 640) setBreakpoint('xs')
      else if (width < 768) setBreakpoint('sm')
      else if (width < 1024) setBreakpoint('md')
      else if (width < 1280) setBreakpoint('lg')
      else if (width < 1536) setBreakpoint('xl')
      else setBreakpoint('2xl')
    }

    updateBreakpoint()
    window.addEventListener('resize', updateBreakpoint)
    return () => window.removeEventListener('resize', updateBreakpoint)
  }, [])

  return (
    <BreakpointContext.Provider value={breakpoint}>
      {children}
    </BreakpointContext.Provider>
  )
}

export function useBreakpoint() {
  return useContext(BreakpointContext)
}

// Layout components
export const Layout = ({
  children,
  className = '',
  style,
  ...props
}) => (
  <div className={`layout ${className}`} style={style} {...props}>
    {children}
  </div>
)

Layout.Header = ({ children, className = '', ...props }) => (
  <header className={`layout-header ${className}`} {...props}>
    {children}
  </header>
)

Layout.Main = ({ children, className = '', ...props }) => (
  <main className={`layout-main ${className}`} {...props}>
    {children}
  </main>
)

Layout.Content = ({ children, className = '', ...props }) => (
  <div className={`layout-content ${className}`} {...props}>
    {children}
  </div>
)

Layout.Footer = ({ children, className = '', ...props }) => (
  <footer className={`layout-footer ${className}`} {...props}>
    {children}
  </footer>
)

Layout.Sidebar = ({ children, className = '', ...props }) => (
  <aside className={`layout-sidebar ${className}`} {...props}>
    {children}
  </aside>
)

// Grid system
export const Grid = ({
  children,
  columns = 12,
  gap = '16px',
  className = '',
  style,
  ...props
}) => (
  <div
    className={`grid ${className}`}
    style={{ 
      ...style,
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap
    }}
    {...props}
  >
    {children}
  </div>
)

Grid.Item = ({ children, span = 1, className = '', style, ...props }) => (
  <div
    className={`grid-item ${className}`}
    style={{ ...style, gridColumn: `span ${span}` }}
    {...props}
  >
    {children}
  </div>
)

// Panel with resize handle
export function Panel({
  children,
  className = '',
  style,
  defaultSize = '50%',
  minSize = '100px',
  maxSize = 'calc(100% - 100px)',
  resizable = true,
  onResize,
  ...props
}) {
  const [size, setSize] = useState(defaultSize)
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef(null)
  const startRef = useRef({ x: 0, size: 0 })

  const handleMouseDown = useCallback((e) => {
    if (!resizable) return
    e.preventDefault()
    setIsResizing(true)
    startRef.current = { x: e.clientX, size: parseFloat(size) }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [resizable, size])

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return
    const delta = e.clientX - startRef.current.x
    const newSize = Math.max(
      parseFloat(minSize),
      Math.min(parseFloat(maxSize), startRef.current.size + delta)
    )
    setSize(`${newSize}px`)
    onResize?.(newSize)
  }, [isResizing, minSize, maxSize, onResize])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  return (
    <div
      ref={panelRef}
      className={`panel ${className} ${isResizing ? 'resizing' : ''}`}
      style={{ ...style, flexBasis: size }}
      {...props}
    >
      {children}
      {resizable && (
        <div
          className="panel-resize-handle"
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              setSize(s => Math.max(parseFloat(minSize), parseFloat(s) - 20) + 'px')
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              setSize(s => Math.min(parseFloat(maxSize), parseFloat(s) + 20) + 'px')
            }
          }}
        />
      )}
    </div>
  )
}

export const PanelResize = Panel

// Sidebar component
export function Sidebar({
  children,
  isOpen = true,
  isCollapsed = false,
  width = 280,
  minWidth = 200,
  maxWidth = 480,
  position = 'left',
  animate = true,
  onToggle,
  className = '',
  ...props
}) {
  const prefersReducedMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted && !isOpen) return null

  const sidebarStyle = {
    width: isCollapsed ? '60px' : width,
    minWidth: isCollapsed ? '60px' : minWidth,
    maxWidth: isCollapsed ? '60px' : maxWidth,
    transition: animate && !prefersReducedMotion ? 'width 0.2s ease' : 'none',
    transform: !isOpen && position === 'left' ? 'translateX(-100%)' : 
               !isOpen && position === 'right' ? 'translateX(100%)' : 'none',
    transition: animate && !prefersReducedMotion ? 'transform 0.3s ease, width 0.2s ease' : 'none'
  }

  return (
    <aside
      className={`sidebar sidebar-${position} ${isOpen ? 'open' : 'closed'} ${isCollapsed ? 'collapsed' : ''} ${className}`}
      style={sidebarStyle}
      role="complementary"
      aria-label="Sidebar"
      {...props}
    >
      <div className="sidebar-content">
        {children}
      </div>
      {!isCollapsed && onToggle && (
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
        >
          {position === 'left' ? (
            <ChevronLeft size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </button>
      )}
    </aside>
  )
}

// Sidebar toggle button
export function SidebarToggle({ onClick, isOpen, className = '', ...props }) {
  return (
    <button
      className={`sidebar-toggle-btn ${isOpen ? 'open' : ''} ${className}`}
      onClick={onClick}
      aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      aria-expanded={isOpen}
      {...props}
    >
      <Menu size={20} aria-hidden="true" />
    </button>
  )
}

// Container component
export const Container = ({
  children,
  size = 'lg',
  className = '',
  style,
  ...props
}) => {
  const maxWidths = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
    full: '100%'
  }

  return (
    <div
      className={`container ${className}`}
      style={{ 
        ...style,
        maxWidth: maxWidths[size],
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: '16px',
        paddingRight: '16px',
        width: '100%'
      }}
      {...props}
    >
      {children}
    </div>
  )
}

// Stack component (vertical spacing)
export const Stack = ({
  children,
  gap = '16px',
  className = '',
  style,
  ...props
}) => (
  <div
    className={`stack ${className}`}
    style={{ 
      ...style,
      display: 'flex',
      flexDirection: 'column',
      gap
    }}
    {...props}
  >
    {children}
  </div>
)

// Flex component
export const Flex = ({
  children,
  direction = 'row',
  align = 'stretch',
  justify = 'flex-start',
  gap = '0',
  wrap = 'nowrap',
  className = '',
  style,
  ...props
}) => (
  <div
    className={`flex ${className}`}
    style={{ 
      ...style,
      display: 'flex',
      flexDirection: direction,
      alignItems: align,
      justifyContent: justify,
      gap,
      flexWrap: wrap
    }}
    {...props}
  >
    {children}
  </div>
)

// Responsive visibility
export function Responsive({ children, show, hide }) {
  const breakpoint = useBreakpoint()
  
  const shouldShow = useMemo(() => {
    if (show && !show.includes(breakpoint)) return false
    if (hide && hide.includes(breakpoint)) return false
    return true
  }, [breakpoint, show, hide])

  if (!shouldShow) return null
  return <>{children}</>
}

// Media query hook
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    setMatches(media.matches)
    const listener = (e) => setMatches(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

export default {
  Layout,
  Grid,
  Panel,
  PanelResize,
  Sidebar,
  SidebarToggle,
  BreakpointProvider,
  useBreakpoint,
  Container,
  Stack,
  Flex,
  Responsive,
  useMediaQuery
}