import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const NUMERIC_ID = /^\d+$/;

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/challenges/detail") {
    const id = searchParams.get("id");
    if (id && NUMERIC_ID.test(id)) {
      const url = request.nextUrl.clone();
      url.pathname = `/challenges/${id}`;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/challenges/edit") {
    const id = searchParams.get("id");
    if (id && NUMERIC_ID.test(id)) {
      const url = request.nextUrl.clone();
      url.pathname = `/challenges/${id}/edit`;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/challenges/detail", "/challenges/edit"],
};
