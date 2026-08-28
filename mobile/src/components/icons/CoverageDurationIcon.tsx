import React from 'react';
import Svg, { Line } from 'react-native-svg';

type Props = {
    size?: number;
    color?: string;
};

export default function CoverageDurationIcon({ size = 16, color = '#E60000' }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <Line x1="3" y1="12.5" x2="3" y2="9" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
            <Line x1="6.3" y1="12.5" x2="6.3" y2="7" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
            <Line x1="9.7" y1="12.5" x2="9.7" y2="5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
            <Line x1="13" y1="12.5" x2="13" y2="3.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </Svg>
    );
}
