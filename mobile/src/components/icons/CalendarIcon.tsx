import React from 'react';
import Svg, { G, Path } from 'react-native-svg';

type Props = {
    size?: number;
    color?: string;
};

export default function CalendarIcon({ size = 20, color = '#E60000' }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
            <G id="calendar">
                <Path
                    id="Vector"
                    d="M6.66667 1.66602V4.99962M13.3333 1.66602V4.99962M2.5 8.33322H17.5M4.16667 3.33282H15.8333C16.7538 3.33282 17.5 4.07907 17.5 4.99962V16.6672C17.5 17.5878 16.7538 18.334 15.8333 18.334H4.16667C3.24619 18.334 2.5 17.5878 2.5 16.6672V4.99962C2.5 4.07907 3.24619 3.33282 4.16667 3.33282Z"
                    stroke={color}
                    strokeLinecap="round"
                />
            </G>
        </Svg>
    );
}
