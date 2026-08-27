import React from 'react';
import Svg, { G, Path } from 'react-native-svg';

type Props = {
    size?: number;
    color?: string;
};

export default function ProgressIcon({ size = 12, color = '#6B7280' }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
            <G id="tabler:progress">
                <Path
                    id="Vector"
                    d="M5.09292 9.99966C4.69657 9.90935 4.31587 9.7606 3.96329 9.55828M6.9149 2.00391C7.82049 2.21073 8.62903 2.71889 9.20815 3.44518C9.78727 4.17148 10.1026 5.07287 10.1026 6.00178C10.1026 6.93069 9.78727 7.83209 9.20815 8.55838C8.62903 9.28467 7.82049 9.79283 6.9149 9.99966M2.62368 8.32161C2.37548 7.96047 2.18679 7.56186 2.06479 7.14097M1.96094 5.31854C2.03382 4.88582 2.17411 4.47587 2.37088 4.10009L2.44786 3.96117M3.68407 2.62156C4.11051 2.32862 4.58854 2.11905 5.09292 2.00391"
                    stroke={color}
                    strokeWidth={1.49998}
                    strokeLinecap="round"
                />
            </G>
        </Svg>
    );
}
