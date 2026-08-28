import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
    size?: number;
    color?: string;
};

export default function CheckIcon({ size = 12, color = '#E60000' }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
            <Path d="M2 6.1L4.6 8.5L10 3.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
}
