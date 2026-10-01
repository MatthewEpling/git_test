/** The hand-drawn meadow underneath everything. Coordinates use a 1000×750 viewBox. */
export function Terrain({ milestones }: { milestones: number }) {
  const ink = '#5a4330';
  return (
    <svg className="terrain" viewBox="0 0 1000 750" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="grass" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M8 30q2-6 4 0M26 14q2-6 4 0" stroke="#9aa86a" strokeWidth="1.4" fill="none" opacity="0.6" />
        </pattern>
        <radialGradient id="glow">
          <stop offset="0" stopColor="#ffe9a3" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffe9a3" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1000" height="750" fill="#efe3bf" />
      <rect width="1000" height="750" fill="url(#grass)" />

      {/* Hills */}
      <path d="M0 150Q120 40 260 120T520 90Q600 70 640 110V0H0Z" fill="#d7dfae" stroke={ink} strokeWidth="2" opacity="0.9" />
      <path d="M0 210Q90 130 200 190T380 170" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="2 8" strokeLinecap="round" />
      <path d="M720 0Q760 90 880 80T1000 120V0Z" fill="#dfe5b8" stroke={ink} strokeWidth="2" />

      {/* Meadow patches */}
      <ellipse cx="180" cy="600" rx="160" ry="80" fill="#e3e3b0" opacity="0.8" />
      <ellipse cx="470" cy="330" rx="140" ry="60" fill="#e7e2b5" opacity="0.8" />
      <ellipse cx="880" cy="320" rx="110" ry="70" fill="#e3e3b0" opacity="0.8" />

      {/* Stream and pond */}
      <path
        d="M640 0C620 90 700 160 680 250S600 360 660 440 760 480 770 500"
        fill="none"
        stroke="#8fbfcc"
        strokeWidth="34"
        strokeLinecap="round"
      />
      <path
        d="M640 0C620 90 700 160 680 250S600 360 660 440 760 480 770 500"
        fill="none"
        stroke="#bfe0e6"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray="18 26"
        className="stream-flow"
      />
      <path d="M680 540c0-50 60-76 130-70s120 40 110 86-80 70-150 62-90-30-90-78Z" fill="#9fcad4" stroke={ink} strokeWidth="2.5" />
      <path d="M720 540q30-14 60 0M800 576q30-14 60 0" stroke="#e8f5f7" strokeWidth="3" fill="none" strokeLinecap="round" className="ripple" />
      <g transform="translate(840 520)">
        <ellipse rx="16" ry="9" fill="#7bb36a" stroke={ink} strokeWidth="1.5" />
        <circle cx="4" cy="-3" r="4" fill="#f4a9c0" />
      </g>

      {/* Dirt trail */}
      <path
        d="M-10 470C100 430 200 480 300 440S470 360 560 400 700 420 800 380 940 330 1010 350"
        fill="none"
        stroke="#e2c79c"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <path
        d="M-10 470C100 430 200 480 300 440S470 360 560 400 700 420 800 380 940 330 1010 350"
        fill="none"
        stroke={ink}
        strokeWidth="1.5"
        strokeDasharray="3 14"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* Stones and tufts */}
      {[
        [420, 470], [610, 620], [230, 380], [880, 440], [300, 700],
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="9" ry="6" fill="#d6cbb6" stroke={ink} strokeWidth="1.5" />
      ))}

      {/* Milestone 1: wildflowers */}
      {milestones >= 1 && (
        <g className="grow-in">
          {[
            [60, 445, '#f4a9c0'], [150, 470, '#fff3a8'], [240, 470, '#c3b1e6'], [330, 420, '#f4a9c0'], [430, 395, '#fff3a8'],
            [520, 375, '#c3b1e6'], [740, 410, '#f4a9c0'], [860, 375, '#fff3a8'], [960, 330, '#c3b1e6'],
          ].map(([x, y, c], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <path d="M0 0v10" stroke="#4d7c3a" strokeWidth="1.5" />
              <circle r="5" fill={c as string} stroke={ink} strokeWidth="1" />
              <circle r="1.8" fill="#f2b33d" />
            </g>
          ))}
        </g>
      )}

      {/* Milestone 2: lanterns */}
      {milestones >= 2 && (
        <g className="grow-in">
          {[[120, 425], [380, 395], [600, 375], [880, 325]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle cx="0" cy="-30" r="22" fill="url(#glow)" className="lantern-glow" />
              <path d="M0 0v-26" stroke={ink} strokeWidth="2.5" />
              <rect x="-6" y="-38" width="12" height="14" rx="3" fill="#f6c55a" stroke={ink} strokeWidth="2" />
            </g>
          ))}
        </g>
      )}

      {/* Milestone 3: bridge over the stream */}
      {milestones >= 3 && (
        <g className="grow-in" transform="translate(640 410)">
          <path d="M-46 8Q0 -24 46 8" fill="#c99b6d" stroke={ink} strokeWidth="2.5" />
          <path d="M-46 8Q0 -14 46 8" fill="none" stroke={ink} strokeWidth="1.5" />
          {[-30, -15, 0, 15, 30].map((x) => (
            <path key={x} d={`M${x} ${-6 + Math.abs(x) / 3}v-14`} stroke={ink} strokeWidth="2" />
          ))}
          <path d="M-36 -10Q0 -38 36 -10" fill="none" stroke={ink} strokeWidth="2" />
        </g>
      )}

      {/* Milestone 5: lighthouse by the pond */}
      {milestones >= 5 && (
        <g className="grow-in" transform="translate(930 520)">
          <circle cx="0" cy="-66" r="30" fill="url(#glow)" className="lantern-glow" />
          <path d="M-14 0l5-60h18l5 60Z" fill="#fbf0dc" stroke={ink} strokeWidth="2.5" />
          <path d="M-12 -20h24M-10 -40h20" stroke="#c4552d" strokeWidth="6" />
          <rect x="-10" y="-74" width="20" height="14" rx="3" fill="#f6c55a" stroke={ink} strokeWidth="2" />
          <path d="M-12 -74l12-10 12 10Z" fill="#c4552d" stroke={ink} strokeWidth="2" />
        </g>
      )}

      {/* Compass rose */}
      <g transform="translate(60 70)" opacity="0.7">
        <circle r="24" fill="#fbf0dc" stroke={ink} strokeWidth="2" />
        <path d="M0-20 5 0 0 20-5 0Z" fill="#c4552d" stroke={ink} strokeWidth="1.5" />
        <text y="-28" textAnchor="middle" fontSize="12" fill={ink} fontFamily="Georgia, serif">N</text>
      </g>
    </svg>
  );
}
