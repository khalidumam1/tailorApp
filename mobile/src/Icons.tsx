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
  | 'inbox';

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
  }
}
