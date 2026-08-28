import React from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

type Props = {
    size?: number;
    color?: string;
};

export default function InfoIcon({ size = 16, color = '#E60000' }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <Circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.2" />
            <Line x1="8" y1="7.2" x2="8" y2="11" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
            <Circle cx="8" cy="4.8" r="0.7" fill={color} />
        </Svg>
    );
}
