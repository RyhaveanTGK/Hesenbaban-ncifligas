export function CardBrandMark({ brand }: { brand: "Visa" | "Mastercard" | "Card" }) {
  if (brand === "Visa") {
    return (
      <svg viewBox="0 0 48 16" className="h-4 w-auto" role="img" aria-label="Visa">
        <path
          fill="#1A1F71"
          d="M0 0h48v16H0z"
          opacity="0"
        />
        <text
          x="0"
          y="13"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="15"
          fontStyle="italic"
          fontWeight="700"
          letterSpacing="-0.5"
          fill="#1A1F71"
          stroke="#F7F7FF"
          strokeWidth="0.4"
        >
          VISA
        </text>
      </svg>
    );
  }
  if (brand === "Mastercard") {
    return (
      <svg viewBox="0 0 40 24" className="h-5 w-auto" role="img" aria-label="Mastercard">
        <circle cx="15" cy="12" r="9.5" fill="#EB001B" />
        <circle cx="25" cy="12" r="9.5" fill="#F79E1B" />
        <path
          d="M20 4.6a9.47 9.47 0 0 1 0 14.8 9.47 9.47 0 0 1 0-14.8Z"
          fill="#FF5F00"
        />
      </svg>
    );
  }
  return null;
}
