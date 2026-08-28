import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
    size?: number;
    color?: string;
};

export default function BenefitsIcon({ size = 16, color = '#E60000' }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <Path d="M3.2 5.3H12.8V12.1C12.8 12.8 12.2 13.3 11.5 13.3H4.5C3.8 13.3 3.2 12.8 3.2 12.1V5.3Z" stroke={color} strokeWidth="1.1" />
            <Path d="M4.4 3.4V6.4M11.6 3.4V6.4M3.2 8H12.8" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
            <Circle cx="10.8" cy="10.5" r="1.2" stroke={color} strokeWidth="1" />
            <Path d="M10.8 9.8V11.2M10.1 10.5H11.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
        </Svg>
    );
}
