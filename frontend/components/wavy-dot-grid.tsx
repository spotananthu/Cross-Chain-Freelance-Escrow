'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from '@/providers/theme-provider'

export function WavyDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()
  const mouseRef = useRef({ x: -1000, y: -1000 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Configuration
    const DOT_SPACING = 35
    const DOT_RADIUS = 2
    const MOUSE_RADIUS = 100 // Area of influence around mouse (reduced)
    const PUSH_STRENGTH = 15 // How far dots get pushed (reduced)

    let animationId: number

    // Store dot positions for smooth animation
    interface Dot {
      baseX: number
      baseY: number
      x: number
      y: number
      vx: number
      vy: number
    }
    let dots: Dot[] = []

    // Handle resize
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initDots()
    }

    // Initialize dots grid
    const initDots = () => {
      dots = []
      const cols = Math.ceil(canvas.width / DOT_SPACING) + 1
      const rows = Math.ceil(canvas.height / DOT_SPACING) + 1

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          dots.push({
            baseX: i * DOT_SPACING,
            baseY: j * DOT_SPACING,
            x: i * DOT_SPACING,
            y: j * DOT_SPACING,
            vx: 0,
            vy: 0
          })
        }
      }
    }

    // Handle mouse move
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }

    // Handle mouse leave
    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    // Draw and animate
    const draw = () => {
      if (!ctx || !canvas) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Determine dot color based on theme
      const isDark = theme === 'dark' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

      const mouse = mouseRef.current

      dots.forEach((dot) => {
        // Calculate distance from mouse
        const dx = mouse.x - dot.baseX
        const dy = mouse.y - dot.baseY
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Target position (where dot wants to be)
        let targetX = dot.baseX
        let targetY = dot.baseY

        // If mouse is close, push dot away
        if (distance < MOUSE_RADIUS && distance > 0) {
          const force = (MOUSE_RADIUS - distance) / MOUSE_RADIUS
          const angle = Math.atan2(dy, dx)
          const pushX = Math.cos(angle) * force * PUSH_STRENGTH
          const pushY = Math.sin(angle) * force * PUSH_STRENGTH
          targetX = dot.baseX - pushX
          targetY = dot.baseY - pushY
        }

        // Smooth spring animation towards target
        const springStrength = 0.08
        const damping = 0.75

        dot.vx += (targetX - dot.x) * springStrength
        dot.vy += (targetY - dot.y) * springStrength
        dot.vx *= damping
        dot.vy *= damping
        dot.x += dot.vx
        dot.y += dot.vy

        // Calculate visual properties based on displacement
        const displacement = Math.sqrt(
          Math.pow(dot.x - dot.baseX, 2) + 
          Math.pow(dot.y - dot.baseY, 2)
        )
        
        // Subtle size and opacity change when displaced
        const scale = 1 + (displacement / PUSH_STRENGTH) * 0.3
        const opacity = 0.12 + (displacement / PUSH_STRENGTH) * 0.15

        // Set color with dynamic opacity
        ctx.fillStyle = isDark 
          ? `rgba(255, 255, 255, ${Math.min(opacity, 0.3)})` 
          : `rgba(0, 0, 0, ${Math.min(opacity, 0.25)})`

        // Draw dot
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, DOT_RADIUS * scale, 0, Math.PI * 2)
        ctx.fill()
      })

      animationId = requestAnimationFrame(draw)
    }

    // Initialize
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)
    draw()

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      cancelAnimationFrame(animationId)
    }
  }, [theme])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  )
}
