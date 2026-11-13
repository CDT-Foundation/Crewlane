import QRCode from "qrcode";

/** Server-rendered QR code (inline SVG). */
export async function Qr({ value, size = 160 }: { value: string; size?: number }) {
  const svg = await QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <div
      style={{ width: size, height: size }}
      className="[&_svg]:h-full [&_svg]:w-full"
      // qrcode renders a self-contained SVG from our own value.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
