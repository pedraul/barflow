import React from "react";
import QRCodeSVG from "react-qr-code";
import { useNavigate } from "react-router-dom";
import "./QRCode.css";
import { PUBLIC_APP_URL } from './config/publicAppUrl';

export default function QRCode({ value, size = 200, fg = '#000000', bg = '#ffffff', level = 'M' }) {
  const navigate = useNavigate();

  const qrValue = value
    ? value.startsWith('/') ? `${PUBLIC_APP_URL}${value}` : value
    : `${PUBLIC_APP_URL}/menu`;
  const relativePath = qrValue.replace(PUBLIC_APP_URL, '') || '/menu';

  return (
    <div className="qr-widget">
      <div className="qr-widget-head">
        <span>Customer Menu</span>
      </div>

      <button
        type="button"
        className="qr-image"
        onClick={() => navigate(relativePath)}
        title="Open Customer Menu"
      >
        <QRCodeSVG
          value={qrValue}
          size={size}
          bgColor={bg}
          fgColor={fg}
        />
      </button>

      <div className="qr-widget-footer">
        <p>Scan to order</p>
        <span className="qr-widget-hint">Open on any mobile device</span>
      </div>
    </div>
  );
}
