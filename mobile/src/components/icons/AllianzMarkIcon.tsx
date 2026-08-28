import React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

type Props = {
    size?: number;
    color?: string;
};

export default function AllianzMarkIcon({ size = 20, color = '#1253A4' }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
            <Circle cx="10" cy="10" r="8" stroke={color} strokeWidth="1.6" />
            <Line x1="6.7" y1="13.3" x2="6.7" y2="7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
            <Line x1="10" y1="13.3" x2="10" y2="5.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
            <Line x1="13.3" y1="13.3" x2="13.3" y2="7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </Svg>
    );
}
