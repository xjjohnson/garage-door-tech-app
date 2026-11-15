import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** The line icons of the 0.9 look (24-unit grid, 2px round strokes), drawn from the approved mock-ups. */
export type IconName = 'clock' | 'wrench' | 'users' | 'dollar' | 'gear' | 'pin' | 'phone' | 'chat' | 'cam' | 'check' | 'sun' | 'sync' | 'plus' | 'search' | 'door' | 'opener' | 'truck' | 'calc' | 'weight' | 'diag' | 'book' | 'bell' | 'cal' | 'tag' | 'chart' | 'star' | 'warn' | 'wrap' | 'mail' | 'back' | 'chevron' | 'shield' | 'download';

export function Icon({ name, color, size = 22 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shape(name)}
    </Svg>
  );
}

function shape(name: IconName) {
  switch (name) {
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M12 7v5l3 2" />
        </>
      );
    case 'wrench':
      return <Path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" />;
    case 'users':
      return (
        <>
          <Circle cx={9} cy={8} r={3.2} />
          <Path d="M3 20a6 6 0 0 1 12 0" />
          <Circle cx={17} cy={9} r={2.4} />
          <Path d="M16 14a5 5 0 0 1 5 5" />
        </>
      );
    case 'dollar':
      return <Path d="M12 3v18M16 7.5c-.5-1.5-2-2.5-4-2.5-2.2 0-4 1.2-4 3s1.5 2.5 4 3 4 1.2 4 3-1.8 3-4 3c-2.2 0-3.7-1-4.2-2.5" />;
    case 'gear':
      return (
        <>
          <Circle cx={12} cy={12} r={3} />
          <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </>
      );
    case 'pin':
      return (
        <>
          <Path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" />
          <Circle cx={12} cy={10} r={2.5} />
        </>
      );
    case 'phone':
      return <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />;
    case 'chat':
      return <Path d="M4 5h16v11H9l-5 4z" />;
    case 'cam':
      return (
        <>
          <Path d="M4 8h3l2-2h6l2 2h3v11H4z" />
          <Circle cx={12} cy={13} r={3.5} />
        </>
      );
    case 'check':
      return <Path d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'sun':
      return (
        <>
          <Circle cx={12} cy={12} r={4} />
          <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        </>
      );
    case 'sync':
      return <Path d="M20 8a8 8 0 0 0-14-2M4 4v4h4M4 16a8 8 0 0 0 14 2M20 20v-4h-4" />;
    case 'plus':
      return <Path d="M12 5v14M5 12h14" />;
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={6} />
          <Path d="M20 20l-4.5-4.5" />
        </>
      );
    case 'door':
      return <Path d="M4 20V8l8-4 8 4v12M7 20v-8h10v8M7 14h10M7 17h10" />;
    case 'opener':
      return (
        <>
          <Rect x={4} y={6} width={16} height={6} rx={2} />
          <Path d="M12 12v6M9 18h6" />
        </>
      );
    case 'truck':
      return (
        <>
          <Path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
          <Circle cx={7} cy={18} r={1.6} />
          <Circle cx={17} cy={18} r={1.6} />
        </>
      );
    case 'calc':
      return (
        <>
          <Rect x={5} y={3} width={14} height={18} rx={2.5} />
          <Path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
        </>
      );
    case 'weight':
      return (
        <>
          <Path d="M6.5 9h11l2 11h-15z" />
          <Circle cx={12} cy={6} r={2.5} />
        </>
      );
    case 'diag':
      return <Path d="M3 12h4l2.5-6 4 12 2.5-6h5" />;
    case 'book':
      return <Path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v14H6.5A1.5 1.5 0 0 0 5 18.5zM5 18.5A1.5 1.5 0 0 0 6.5 20H18v-3" />;
    case 'bell':
      return <Path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />;
    case 'cal':
      return (
        <>
          <Rect x={4} y={5} width={16} height={15} rx={2.5} />
          <Path d="M4 10h16M8 3v4M16 3v4" />
        </>
      );
    case 'tag':
      return <Path d="M3 12V4h8l10 10-8 8zM7.5 8.5h.01" />;
    case 'chart':
      return <Path d="M4 20v-9M10 20V5M16 20v-6M22 20H2" />;
    case 'star':
      return <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />;
    case 'warn':
      return <Path d="M12 4l9 16H3zM12 10v4M12 17h.01" />;
    case 'wrap':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M8.5 12.3l2.4 2.4 4.6-5" />
        </>
      );
    case 'mail':
      return (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2} />
          <Path d="M3 7l9 6 9-6" />
        </>
      );
    case 'back':
      return <Path d="M15 6l-6 6 6 6" />;
    case 'chevron':
      return <Path d="M9 6l6 6-6 6" />;
    case 'shield':
      return <Path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5" />;
    case 'download':
      return <Path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14" />;
  }
}
