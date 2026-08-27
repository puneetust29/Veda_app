import React from 'react';
import Svg, { G, Path } from 'react-native-svg';

type Props = {
    width?: number;
    height?: number;
    color?: string;
};

export default function VedaIcon({ width = 20, height = 13, color = '#FFFFFF' }: Props) {
    const aspectRatio = 20.1746 / 13.407;
    const calculatedHeight = width / aspectRatio;

    return (
        <Svg
            width={width}
            height={calculatedHeight}
            viewBox="0 0 20.1746 13.407"
            fill="none"
        >
            <G id="Group 2055253464">
                <G id="Group 2055253463">
                    <Path
                        id="Vector 9556"
                        d="M13.5044 13.407H7.85539C7.66341 13.407 7.53875 13.2047 7.62505 13.0332L11.7046 4.9264C11.7922 4.75234 11.9704 4.64251 12.1653 4.64251H17.1862C17.5689 4.64251 17.8183 5.04485 17.648 5.38767L13.7353 13.2639C13.6918 13.3515 13.6023 13.407 13.5044 13.407Z"
                        fill={color}
                    />
                    <Path
                        id="Subtract"
                        d="M5.98178 0.000744331C6.07921 0.000744331 6.16832 0.0556583 6.21211 0.142689L9.62844 6.93139C9.66513 7.00431 9.66513 7.0903 9.62844 7.16321L6.80546 12.773C6.70995 12.9628 6.43873 12.9621 6.34419 12.7718L0.184991 0.373323C0.0998392 0.201913 0.224528 0.000744331 0.415923 0.000744331H5.98178Z"
                        fill={color}
                    />
                </G>
                <Path
                    id="Subtract_2"
                    d="M19.9164 2.97732e-05C20.1078 8.4631e-05 20.2325 0.201328 20.1473 0.372715L19.169 2.3418C18.7045 3.2767 17.7507 3.8679 16.7067 3.8679H16.4162C14.5025 3.8679 13.2599 1.85148 14.1202 0.142053C14.1639 0.0550227 14.2531 2.97732e-05 14.3506 2.97732e-05H19.9164Z"
                    fill={color}
                />
            </G>
        </Svg>
    );
}
