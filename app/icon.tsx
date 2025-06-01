import { ImageResponse } from 'next/og'
 
// Route segment config
export const runtime = 'edge'
 
// Image metadata
export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'
 
// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      // Cat butthole favicon
      <div
        style={{
          fontSize: 24,
          background: 'transparent',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 120 120"
        >
          {/* Outer fur circle */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="#8B4513"
            stroke="#654321"
            strokeWidth="4"
          />
          {/* Inner pink area */}
          <circle
            cx="60"
            cy="60"
            r="35"
            fill="#FF69B4"
            stroke="#EC4899"
            strokeWidth="2"
          />
          {/* The infamous asterisk pattern */}
          <g
            transform="translate(60, 60)"
            stroke="#8B0000"
            strokeWidth="5"
            fill="none"
          >
            <line x1="-15" y1="0" x2="15" y2="0" />
            <line x1="-10.6" y1="-10.6" x2="10.6" y2="10.6" />
            <line x1="0" y1="-15" x2="0" y2="15" />
            <line x1="-10.6" y1="10.6" x2="10.6" y2="-10.6" />
          </g>
          {/* Center dot */}
          <circle cx="60" cy="60" r="5" fill="#8B0000" />
        </svg>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  )
}