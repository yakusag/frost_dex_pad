/// <reference types="vite/client" />

declare const __GROQ_KEY__: string;

// qrcode.react v1 ships no type declarations.
declare module "qrcode.react" {
  import { Component } from "react";
  interface QRCodeProps {
    value: string;
    size?: number;
    level?: "L" | "M" | "Q" | "H";
    bgColor?: string;
    fgColor?: string;
    includeMargin?: boolean;
    renderAs?: "canvas" | "svg";
    style?: React.CSSProperties;
    className?: string;
  }
  export default class QRCode extends Component<QRCodeProps> {}
}
