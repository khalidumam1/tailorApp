/**
 * Same pictogram set as the web app (see web/src/Icons.tsx), ported to
 * react-native-svg so the phone app and the desk/admin app always show the
 * same picture for the same idea. Icons are plain, literal objects (a
 * shirt, a ruler, a wallet) rather than abstract shapes, so the bottom
 * tab bar can be understood at a glance without reading the label.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'orders'
  | 'catalog'
  | 'customers'
  | 'measurements'
  | 'notifications'
  | 'subscription'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'signOut'
  | 'inbox'
  | 'plus'
  | 'wallet'
  | 'chat'
  | 'chart'
  | 'bell'
  | 'check'
  | 'search'
  | 'arrowUp'
  | 'arrowRight'
  | 'arrowLeft'
  | 'arrowDown'
  | 'card'
  | 'users'
  | 'calendar'
  | 'tag'
  | 'phone'
  | 'menu'
  | 'palette'
  | 'shield'
  | 'spark'
  | 'download'
  | 'building'
  | 'globe'
  | 'star'
  | 'send'
  | 'alert';

const common = {
  fill: 'none' as const,
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Icon({ name, size = 24, color = '#182A25' }: { name: IconName; size?: number; color?: string }) {
  const props = { ...common, stroke: color };
  switch (name) {
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 11.2 12 4l8 7.2" {...props} />
          <Path d="M6 9.8V20h12V9.8" {...props} />
          <Path d="M10 20v-5.5h4V20" {...props} />
        </Svg>
      );
    case 'orders':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M9 4h6l1.6 2.1L19 7.6l-2.3 2.3-.7-.6V19a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9.3l-.7.6L5 7.6l2.4-1.5L9 4Z" {...props} />
        </Svg>
      );
    case 'catalog':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12.6 3.6 20 11l-8.4 8.4a2 2 0 0 1-2.8 0L4 14.6a2 2 0 0 1 0-2.8L12.6 3.6Z" {...props} />
          <Path d="M4 14.6 12.6 6" {...props} />
          <Circle cx={14.7} cy={8.9} r={1.3} {...props} />
        </Svg>
      );
    case 'customers':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={9} cy={8} r={3} {...props} />
          <Path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" {...props} />
          <Circle cx={17} cy={8.5} r={2.3} {...props} />
          <Path d="M15.3 14.8c2.6.2 4.7 2.3 4.7 5.2" {...props} />
        </Svg>
      );
    case 'measurements':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3.3} y={7.8} width={17.4} height={8.4} rx={1.4} transform="rotate(-18 12 12)" {...props} />
          <Path d="m8.1 9.8.9 2.4M11.2 8.7l.9 2.4M14.3 7.6l.9 2.4" {...props} />
        </Svg>
      );
    case 'notifications':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 4a8 8 0 0 0-6.9 12.1L4 20l4-1a8 8 0 1 0 4-15Z" {...props} />
          <Path d="M9 11.2c.3 1.9 2 3.6 3.9 3.9" {...props} />
        </Svg>
      );
    case 'subscription':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3} y={5.5} width={18} height={13} rx={2.2} {...props} />
          <Path d="M3 10h18" {...props} />
          <Path d="M6.5 14.3h4" {...props} />
        </Svg>
      );
    case 'settings':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={3} {...props} />
          <Path
            d="M12 3.5v2.3M12 18.2v2.3M4.9 6.4l1.6 1.6M17.5 16l1.6 1.6M3.5 12h2.3M18.2 12h2.3M4.9 17.6l1.6-1.6M17.5 8l1.6-1.6"
            {...props}
          />
        </Svg>
      );
    case 'sun':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={4} {...props} />
          <Path d="M12 2.8v2M12 19.2v2M4.8 4.8l1.4 1.4m11.6 11.6 1.4 1.4M2.8 12h2m14.4 0h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4" {...props} />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M20 15.4A8.6 8.6 0 0 1 8.6 4a8.7 8.7 0 1 0 11.4 11.4Z" {...props} />
        </Svg>
      );
    case 'signOut':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" {...props} />
          <Path d="M11 12h9m0 0-3-3m3 3-3 3" {...props} />
        </Svg>
      );
    case 'inbox':
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 12.5 6.3 5h11.4l2.3 7.5" {...props} />
          <Path d="M4 12.5h5.2l1 2.2h3.6l1-2.2H20V18a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18v-5.5Z" {...props} />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" {...props} />
        </Svg>
      );
    case 'wallet':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3.5} y={6.5} width={17} height={12} rx={2.2} {...props} />
          <Path d="M16 12.5h2.5" {...props} />
          <Path d="M3.5 9.5h17" {...props} />
        </Svg>
      );
    case 'chat':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-4 3.5v-3.5H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" {...props} />
        </Svg>
      );
    case 'chart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 19V5" {...props} />
          <Path d="M4 19h16" {...props} />
          <Path d="M7 15l3-4 3 3 5-7" {...props} />
        </Svg>
      );
    case 'bell':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5.5 17.5h13l-1.6-2V11a4.9 4.9 0 0 0-9.8 0v4.5l-1.6 2Z" {...props} />
          <Path d="M10 20.5a2 2 0 0 0 4 0" {...props} />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 12.5 10 17.5 19 7.5" {...props} />
        </Svg>
      );
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={11} cy={11} r={6} {...props} />
          <Path d="m20 20-4-4" {...props} />
        </Svg>
      );
    case 'arrowUp':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 19V5M6 11l6-6 6 6" {...props} />
        </Svg>
      );
    case 'arrowDown':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 5v14M6 13l6 6 6-6" {...props} />
        </Svg>
      );
    case 'arrowLeft':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M19 12H5M11 6l-6 6 6 6" {...props} />
        </Svg>
      );
    case 'arrowRight':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 12h14M13 6l6 6-6 6" {...props} />
        </Svg>
      );
    case 'card':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3} y={6} width={18} height={12} rx={2} {...props} />
          <Path d="M3 10h18" {...props} />
          <Path d="M7 15h4" {...props} />
        </Svg>
      );
    case 'users':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={9} cy={9} r={3} {...props} />
          <Path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" {...props} />
          <Circle cx={16.5} cy={8.5} r={2.5} {...props} />
          <Path d="M14.5 14.8c2.8.2 5 2.3 5 5.2" {...props} />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3.5} y={5.5} width={17} height={15} rx={2} {...props} />
          <Path d="M3.5 10h17" {...props} />
          <Path d="M8 3.5v4M16 3.5v4" {...props} />
        </Svg>
      );
    case 'tag':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5-8.5-8.5Z" {...props} />
          <Circle cx={8} cy={8.5} r={1.4} {...props} />
        </Svg>
      );
    case 'phone':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 4.5h4l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6.5a2 2 0 0 1 2-2Z" {...props} />
        </Svg>
      );
    case 'menu':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 7h16M4 12h16M4 17h16" {...props} />
        </Svg>
      );
    case 'palette':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3.5a8.5 8.5 0 1 0 0 17 2 2 0 0 0 2-2 1.5 1.5 0 0 1 1.5-1.5h1.5a3 3 0 0 0 3-3A8.5 8.5 0 0 0 12 3.5Z" {...props} />
          <Circle cx={7.5} cy={11} r={1.2} {...props} />
          <Circle cx={9.5} cy={6.5} r={1.2} {...props} />
          <Circle cx={14.5} cy={6.5} r={1.2} {...props} />
          <Circle cx={17} cy={11} r={1.2} {...props} />
        </Svg>
      );
    case 'shield':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3.5 4 6.5v6c0 4.5 3.5 7.5 8 8.5 4.5-1 8-4 8-8.5v-6L12 3.5Z" {...props} />
        </Svg>
      );
    case 'spark':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.5 5.5l4 4M14.5 14.5l4 4M18.5 5.5l-4 4M9.5 14.5l-4 4" {...props} />
        </Svg>
      );
    case 'download':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 4v11M7 10l5 5 5-5" {...props} />
          <Path d="M4 19h16" {...props} />
        </Svg>
      );
    case 'building':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V9h5.5A1.5 1.5 0 0 1 20 10.5V20" {...props} />
          <Path d="M4 20h16" {...props} />
          <Path d="M8 8h1M8 12h1M8 16h1M14 12h1M14 16h1" {...props} />
        </Svg>
      );
    case 'globe':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8.5} {...props} />
          <Path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17" {...props} />
        </Svg>
      );
    case 'star':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="m12 4 2.5 5.5 5.5.6-4 4 1 5.4-5-3-5 3 1-5.4-4-4 5.5-.6L12 4Z" {...props} />
        </Svg>
      );
    case 'send':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="m4 4 16 8-16 8 3-8-3-8Z" {...props} />
          <Path d="M7 12h13" {...props} />
        </Svg>
      );
    case 'alert':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 3.5 2.5 19h19L12 3.5Z" {...props} />
          <Path d="M12 10v4M12 17.2v.1" {...props} />
        </Svg>
      );
  }
}
