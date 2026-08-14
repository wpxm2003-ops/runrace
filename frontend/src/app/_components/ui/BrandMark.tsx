const SIZE_CLASSES = {
  sm: "text-lg",
  md: "text-[1.65rem]",
  lg: "text-4xl",
} as const;

export function BrandMark({
  size = "md",
  inverse = false,
}: {
  size?: keyof typeof SIZE_CLASSES;
  inverse?: boolean;
}) {
  return (
    <span
      aria-label="RunRace"
      className={`inline-flex -skew-x-6 items-baseline font-black italic leading-none tracking-[-0.075em] ${SIZE_CLASSES[size]}`}
    >
      <span aria-hidden="true" className={inverse ? "text-white" : "text-logo-magenta"}>run</span>
      <span aria-hidden="true" className={inverse ? "text-brand" : "text-logo-blue"}>race</span>
    </span>
  );
}
