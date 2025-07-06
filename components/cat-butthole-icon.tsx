// The official Chat Gippidy logo - a masterpiece of design
export const CatButtholeIcon = ({ size = 24 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className="text-pink-400"
    >
      {/* Outer fur circle - adapts to theme */}
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="currentColor"
        stroke="hsl(var(--foreground))"
        strokeWidth="2"
        opacity="0.8"
      />
      {/* Inner pink area - consistent pink */}
      <circle
        cx="60"
        cy="60"
        r="35"
        fill="#FF69B4"
        stroke="#EC4899"
        strokeWidth="1"
      />
      {/* The infamous asterisk pattern - high contrast */}
      <g
        transform="translate(60, 60)"
        stroke="hsl(var(--foreground))"
        strokeWidth="3"
        fill="none"
      >
        <line x1="-15" y1="0" x2="15" y2="0" />
        <line x1="-10.6" y1="-10.6" x2="10.6" y2="10.6" />
        <line x1="0" y1="-15" x2="0" y2="15" />
        <line x1="-10.6" y1="10.6" x2="10.6" y2="-10.6" />
      </g>
      {/* Center dot - high contrast */}
      <circle cx="60" cy="60" r="3" fill="hsl(var(--foreground))" />
    </svg>
  );
};
