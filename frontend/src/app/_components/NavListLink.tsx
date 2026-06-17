import Link from "next/link";

type Props = {
  href: string;
  label: string;
};

/** 페이지 헤더용 목록 이동 아이콘 버튼 */
export function NavListLink({ href, label }: Props) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
        <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
      </svg>
    </Link>
  );
}
